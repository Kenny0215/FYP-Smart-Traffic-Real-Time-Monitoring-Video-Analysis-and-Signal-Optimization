import cv2
import os
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

# ─────────────────────────────────────────────────────────
# MODULE 2 — Vehicle Tracking + Counting (DeepSORT)
# Assigns unique ID to each vehicle, prevents double counting
# Estimates speed, tracks movement across frames
# ─────────────────────────────────────────────────────────

# ── SETTINGS ──────────────────────────────────────────────
LANE_VIDEOS = {
    "Lane A": "traffic A.mp4",
    "Lane B": "traffic B.mp4",
    "Lane C": "traffic C.mp4",
    "Lane D": "traffic D.mp4"
}

OUTPUT_DIR       = "output_M1-M3/"
CONFIDENCE_THRESHOLD = 0.4
VEHICLE_CLASSES  = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}

BOX_COLORS = {
    "Car":        (0, 255, 0),
    "Motorcycle": (255, 165, 0),
    "Bus":        (0, 0, 255),
    "Truck":      (255, 0, 255),
    "Unknown":    (200, 200, 200),
}

# ── SPEED ESTIMATION ──────────────────────────────────────
# Rough pixels-per-meter estimate (adjust for your video scale)
PIXELS_PER_METER = 8.0
# How many frames between speed samples
SPEED_SAMPLE_FRAMES = 5


# ── TRACKING FUNCTION ─────────────────────────────────────

def track_lane(model, lane_name, video_path):
    """
    Run DeepSORT tracking on a single lane video.
    Returns summary with unique vehicle count, avg speed, per-frame data.
    """
    print(f"\n[INFO] Tracking {lane_name}: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open: {video_path}")
        return None

    width        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps          = int(cap.get(cv2.CAP_PROP_FPS)) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, f"{lane_name.replace(' ', '_')}_tracked.mp4")
    fourcc   = cv2.VideoWriter_fourcc(*"mp4v")
    out      = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

    # DeepSORT tracker — one instance per lane
    tracker = DeepSort(max_age=30, n_init=3, max_iou_distance=0.7)

    # Tracking state
    frame_num         = 0
    seen_ids          = set()          # unique vehicle IDs seen so far
    id_positions      = {}             # {track_id: [prev_center, frame_num]}
    id_speeds         = {}             # {track_id: speed_kmh}
    id_labels         = {}             # {track_id: vehicle_type}
    all_frame_counts  = []             # active vehicles per frame
    all_speed_samples = []             # all speed readings

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_num += 1
        results = model(frame, verbose=False)[0]

        # ── Build detection list for DeepSORT ─────────────
        # Format: ([x, y, w, h], confidence, class_label)
        detections = []
        for box in results.boxes:
            class_id   = int(box.cls[0])
            confidence = float(box.conf[0])
            if class_id not in VEHICLE_CLASSES or confidence < CONFIDENCE_THRESHOLD:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            w = x2 - x1
            h = y2 - y1
            label = VEHICLE_CLASSES[class_id]
            detections.append(([x1, y1, w, h], confidence, label))

        # ── Update tracker ─────────────────────────────────
        tracks = tracker.update_tracks(detections, frame=frame)

        active_count = 0

        for track in tracks:
            if not track.is_confirmed():
                continue

            track_id = track.track_id
            ltrb     = track.to_ltrb()          # left, top, right, bottom
            x1, y1, x2, y2 = map(int, ltrb)
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2   # center point

            # Remember vehicle type from first detection
            det_class = track.det_class if track.det_class else "Unknown"
            id_labels[track_id] = det_class

            # Count unique vehicles
            seen_ids.add(track_id)
            active_count += 1

            # ── Speed estimation ───────────────────────────
            speed_kmh = 0.0
            if track_id in id_positions:
                prev_cx, prev_cy, prev_frame = id_positions[track_id]
                frame_diff = frame_num - prev_frame
                if frame_diff >= SPEED_SAMPLE_FRAMES:
                    pixel_dist = ((cx - prev_cx)**2 + (cy - prev_cy)**2) ** 0.5
                    meters     = pixel_dist / PIXELS_PER_METER
                    seconds    = frame_diff / fps
                    speed_kmh  = round((meters / seconds) * 3.6, 1)
                    id_speeds[track_id] = speed_kmh
                    id_positions[track_id] = (cx, cy, frame_num)
                    if speed_kmh > 0:
                        all_speed_samples.append(speed_kmh)
            else:
                id_positions[track_id] = (cx, cy, frame_num)

            speed_kmh = id_speeds.get(track_id, 0.0)

            # ── Draw bounding box + ID + speed ────────────
            color = BOX_COLORS.get(det_class, BOX_COLORS["Unknown"])
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            label_text = f"ID:{track_id} {det_class} {speed_kmh}km/h"
            cv2.putText(frame, label_text, (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 2)

            # Draw center dot
            cv2.circle(frame, (cx, cy), 4, color, -1)

        all_frame_counts.append(active_count)

        # ── Overlay info ───────────────────────────────────
        cv2.putText(frame, f"{lane_name}  |  Active: {active_count}  |  Total Unique: {len(seen_ids)}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2)

        avg_spd = round(sum(all_speed_samples[-20:]) / max(len(all_speed_samples[-20:]), 1), 1)
        cv2.putText(frame, f"Avg Speed (recent): {avg_spd} km/h",
                    (10, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

        # Progress bar
        if total_frames > 0:
            progress = int((frame_num / total_frames) * width)
            cv2.rectangle(frame, (0, height - 8), (progress, height), (0, 200, 0), -1)

        out.write(frame)
        cv2.imshow(f"Tracking - {lane_name}", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            print("[INFO] Stopped by user.")
            break

        # Terminal log every 20 frames
        if frame_num % 20 == 0:
            pct = round(frame_num / total_frames * 100) if total_frames else "?"
            print(f"  {lane_name} — Frame {frame_num}/{total_frames} ({pct}%) | "
                  f"Active: {active_count} | Unique so far: {len(seen_ids)}")

    cap.release()
    out.release()
    cv2.destroyAllWindows()

    # ── Compute final stats ────────────────────────────────
    avg_vehicles = round(sum(all_frame_counts) / max(len(all_frame_counts), 1), 2)
    avg_speed    = round(sum(all_speed_samples) / max(len(all_speed_samples), 1), 1)
    total_unique = len(seen_ids)

    summary = {
        "lane":          lane_name,
        "total_unique":  total_unique,       # true vehicle count (no duplicates)
        "avg_vehicles":  avg_vehicles,       # avg active per frame
        "avg_speed":     avg_speed,          # avg speed km/h
        "id_speeds":     id_speeds,          # per-vehicle speed
        "id_labels":     id_labels,          # per-vehicle type
        "frame_counts":  all_frame_counts,   # for charts
        "output_video":  out_path,
    }

    print(f"\n  ✅ {lane_name} Done!")
    print(f"     Unique vehicles tracked : {total_unique}")
    print(f"     Avg active/frame        : {avg_vehicles}")
    print(f"     Avg speed               : {avg_speed} km/h")
    print(f"     Output saved            : {out_path}")

    return summary


# ── RUN ALL LANES ─────────────────────────────────────────

def run_all_lanes():
    print("=" * 60)
    print("  MODULE 2 — Multi-Lane Vehicle Tracking (DeepSORT)")
    print("=" * 60)

    print("\n[INFO] Loading YOLOv8 model...")
    model = YOLO("yolov8n.pt")
    print("[INFO] Model ready.\n")

    all_results = {}

    for lane_name, video_path in LANE_VIDEOS.items():
        if not os.path.exists(video_path):
            print(f"[WARNING] Skipping {lane_name} — file not found: {video_path}")
            continue
        result = track_lane(model, lane_name, video_path)
        if result:
            all_results[lane_name] = result

    # ── Summary table ──────────────────────────────────────
    print("\n" + "=" * 60)
    print("  TRACKING SUMMARY — ALL LANES")
    print("=" * 60)
    print(f"  {'Lane':<10} {'Unique Vehicles':>16} {'Avg/Frame':>10} {'Avg Speed':>12}")
    print("  " + "-" * 52)
    for lane, r in all_results.items():
        print(f"  {lane:<10} {r['total_unique']:>16} {r['avg_vehicles']:>10} {r['avg_speed']:>10} km/h")

    print("\n[INFO] Module 2 complete. Results ready for Module 3.")
    return all_results


# ── ENTRY POINT ───────────────────────────────────────────
if __name__ == "__main__":
    results = run_all_lanes()
import os
import cv2
import numpy as np
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

# ─────────────────────────────────────────────────────────
# MODULE 3 — Traffic Density Analysis
# Calculates density per lane
# Classifies: Low / Medium / High congestion
# Uses vehicle count from Module 2 tracking
# ─────────────────────────────────────────────────────────

# ── SETTINGS ──────────────────────────────────────────────
LANE_VIDEOS = {
    #"Lane A": "traffic A.mp4",
    #"Lane B": "traffic B.mp4",
    "Lane C": "traffic C.mp4"
    #"Lane D": "traffic D.mp4"
}

OUTPUT_DIR           = "output_M1-M3/"
CONFIDENCE_THRESHOLD = 0.4
VEHICLE_CLASSES      = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}

# ── DENSITY THRESHOLDS (Density Ratio based) ──────────────
# density = vehicle_count / (frame_width * frame_height) * 100000
# Normalized per frame size — works for ANY video/road size

DENSITY_LOW    = 0.5    # 0.0  to 0.5  → Low
DENSITY_MEDIUM = 1.5    # 0.5  to 1.5  → Medium
                        # 1.5+          → High

# ── CONGESTION COLORS (BGR) ───────────────────────────────
COLORS = {
    "Low":    (0, 255, 0),      # Green
    "Medium": (0, 165, 255),    # Orange
    "High":   (0, 0, 255),      # Red
}


# ── DENSITY CLASSIFIER ────────────────────────────────────

def classify_density(vehicle_count, frame_width, frame_height):
    """
    Density ratio = vehicles per 100,000 pixels
    Normalized by frame size — consistent across different videos
    """
    density = (vehicle_count / (frame_width * frame_height)) * 100000
    density = round(density, 4)

    if density <= DENSITY_LOW:
        level = "Low"
    elif density <= DENSITY_MEDIUM:
        level = "Medium"
    else:
        level = "High"

    return density, level   


def calculate_density(vehicle_count, frame_width, frame_height):
    """
    Calculate density as vehicles per 1000 sq pixels.
    Formula: density = vehicle_count / road_area * 1000
    """
    road_area = (frame_width * frame_height) / 1000
    density   = round(vehicle_count / road_area, 4)
    return density


# ── PER LANE ANALYSIS ─────────────────────────────────────

def analyze_lane(model, lane_name, video_path):
    """
    Run detection + density analysis on a single lane.
    Returns full density summary for the lane.
    """
    print(f"\n[INFO] Analyzing density — {lane_name}: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open: {video_path}")
        return None

    width        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps          = int(cap.get(cv2.CAP_PROP_FPS)) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, f"{lane_name.replace(' ', '_')}_density.mp4")
    fourcc   = cv2.VideoWriter_fourcc(*"mp4v")
    out      = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

    tracker = DeepSort(max_age=30, n_init=3, max_iou_distance=0.7)

    # Accumulators
    frame_num          = 0
    density_log        = []     # density per frame
    congestion_log     = []     # congestion level per frame
    low_frames         = 0
    medium_frames      = 0
    high_frames        = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_num += 1
        results = model(frame, verbose=False)[0]

        # Build detections for tracker
        detections = []
        for box in results.boxes:
            class_id   = int(box.cls[0])
            confidence = float(box.conf[0])
            if class_id not in VEHICLE_CLASSES or confidence < CONFIDENCE_THRESHOLD:
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            label = VEHICLE_CLASSES[class_id]
            detections.append(([x1, y1, x2 - x1, y2 - y1], confidence, label))

        tracks       = tracker.update_tracks(detections, frame=frame)
        active_count = sum(1 for t in tracks if t.is_confirmed())

        # One function does both
        density, congestion = classify_density(active_count, width, height)

        density_log.append(density)
        congestion_log.append(congestion)

        if congestion == "Low":
            low_frames += 1
        elif congestion == "Medium":
            medium_frames += 1
        else:
            high_frames += 1

        # ── Draw density overlay ───────────────────────────
        color = COLORS[congestion]

        # Colored banner at top based on congestion
        cv2.rectangle(frame, (0, 0), (width, 75), (30, 30, 30), -1)

        cv2.putText(frame, f"{lane_name}",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

        cv2.putText(frame, f"Vehicles: {active_count}   Density: {density}",
                    (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

        # Congestion badge
        badge_text = f"  {congestion.upper()} CONGESTION  "
        (tw, th), _ = cv2.getTextSize(badge_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        bx = width - tw - 20
        cv2.rectangle(frame, (bx - 5, 8), (bx + tw + 5, 8 + th + 10), color, -1)
        cv2.putText(frame, badge_text, (bx, 8 + th + 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Draw colored border around frame based on congestion
        cv2.rectangle(frame, (0, 0), (width - 1, height - 1), color, 6)

        # Draw bounding boxes for tracked vehicles
        for track in tracks:
            if not track.is_confirmed():
                continue
            x1, y1, x2, y2 = map(int, track.to_ltrb())
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"ID:{track.track_id}",
                        (x1, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        # Progress bar
        if total_frames > 0:
            progress = int((frame_num / total_frames) * width)
            cv2.rectangle(frame, (0, height - 8), (progress, height), (0, 200, 0), -1)

        out.write(frame)
        cv2.imshow(f"Density - {lane_name}", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            print("[INFO] Stopped by user.")
            break

        if frame_num % 20 == 0:
            pct = round(frame_num / total_frames * 100) if total_frames else "?"
            print(f"  {lane_name} — Frame {frame_num}/{total_frames} ({pct}%) | "
                  f"Vehicles: {active_count} | Density: {density} | {congestion}")

    cap.release()
    out.release()
    cv2.destroyAllWindows()

    # ── Final stats ────────────────────────────────────────
    avg_density   = round(np.mean(density_log), 4)   if density_log   else 0
    peak_density  = round(np.max(density_log), 4)    if density_log   else 0
    avg_vehicles  = round(np.mean(
                    [classify_density.__code__.co_consts[0]] * frame_num
                    ) if False else
                    sum(1 for c in congestion_log) / max(frame_num, 1), 2)

    # Dominant congestion level
    counts = {"Low": low_frames, "Medium": medium_frames, "High": high_frames}
    dominant = max(counts, key=counts.get)

    summary = {
        "lane":            lane_name,
        "avg_density":     avg_density,
        "peak_density":    peak_density,
        "dominant":        dominant,         # overall congestion label
        "low_pct":         round(low_frames    / max(frame_num, 1) * 100, 1),
        "medium_pct":      round(medium_frames / max(frame_num, 1) * 100, 1),
        "high_pct":        round(high_frames   / max(frame_num, 1) * 100, 1),
        "density_log":     density_log,      # per-frame → for charts
        "congestion_log":  congestion_log,   # per-frame → for ML model
        "output_video":    out_path,
    }

    print(f"\n  ✅ {lane_name} Done!")
    print(f"     Avg Density    : {avg_density}")
    print(f"     Peak Density   : {peak_density}")
    print(f"     Dominant Level : {dominant}")
    print(f"     Low / Med / High: {summary['low_pct']}% / {summary['medium_pct']}% / {summary['high_pct']}%")

    return summary


# ── RUN ALL LANES ─────────────────────────────────────────

def run_all_lanes():
    print("=" * 60)
    print("  MODULE 3 — Traffic Density Analysis")
    print("=" * 60)

    print("\n[INFO] Loading YOLOv8 model...")
    model = YOLO("yolov8n.pt")
    print("[INFO] Model ready.\n")

    all_results = {}

    for lane_name, video_path in LANE_VIDEOS.items():
        if not os.path.exists(video_path):
            print(f"[WARNING] Skipping {lane_name} — file not found: {video_path}")
            continue
        result = analyze_lane(model, lane_name, video_path)
        if result:
            all_results[lane_name] = result

    # ── Summary table ──────────────────────────────────────
    print("\n" + "=" * 60)
    print("  DENSITY SUMMARY — ALL LANES")
    print("=" * 60)
    print(f"  {'Lane':<10} {'Avg Density':>12} {'Peak':>8} {'Dominant':>10} {'Low%':>7} {'Med%':>7} {'High%':>7}")
    print("  " + "-" * 65)
    for lane, r in all_results.items():
        print(f"  {lane:<10} {r['avg_density']:>12} {r['peak_density']:>8} "
              f"{r['dominant']:>10} {r['low_pct']:>6}% {r['medium_pct']:>6}% {r['high_pct']:>6}%")

    print("\n[INFO] Module 3 complete. Results ready for Module 4 (ML model).")
    return all_results


# ── ENTRY POINT ───────────────────────────────────────────
if __name__ == "__main__":
    results = run_all_lanes()
import cv2
import os
from ultralytics import YOLO

# ─────────────────────────────────────────────────────────
# MODULE 1 — Multi-Lane Vehicle Detection (YOLOv8)
# Each video = one lane road
# ─────────────────────────────────────────────────────────

# ── SETTINGS ──────────────────────────────────────────────
# Add your lane video paths here (add/remove lanes as needed)
LANE_VIDEOS = {
    "Lane A": "traffic A.mp4",
    "Lane B": "traffic B.mp4",
    "Lane C": "traffic C.mp4",
    "Lane D": "traffic D.mp4"
}

OUTPUT_DIR = "output_M1-M3/"
CONFIDENCE_THRESHOLD = 0.4

# COCO class IDs for vehicles
VEHICLE_CLASSES = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}

# Bounding box colors per vehicle type
BOX_COLORS = {
    "Car":        (0, 255, 0),      # Green
    "Motorcycle": (255, 165, 0),    # Orange
    "Bus":        (0, 0, 255),      # Red
    "Truck":      (255, 0, 255),    # Purple
}

# ── MAIN DETECTION FUNCTION ───────────────────────────────

def detect_lane(model, lane_name, video_path):
    """
    Run YOLOv8 detection on a single lane video.
    Returns a summary dict with vehicle counts and density info.
    """
    print(f"\n[INFO] Processing {lane_name}: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video: {video_path}")
        return None

    # Video properties
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = int(cap.get(cv2.CAP_PROP_FPS)) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Output video writer
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, f"{lane_name.replace(' ', '_')}_detected.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

    # Accumulators
    frame_num = 0
    all_frame_counts = []   # vehicle count per frame
    total_type_counts = {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0}

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_num += 1
        results = model(frame, verbose=False)[0]

        frame_counts = {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0}

        for box in results.boxes:
            class_id   = int(box.cls[0])
            confidence = float(box.conf[0])

            if class_id not in VEHICLE_CLASSES or confidence < CONFIDENCE_THRESHOLD:
                continue

            label = VEHICLE_CLASSES[class_id]
            frame_counts[label] += 1
            total_type_counts[label] += 1

            # Draw bounding box
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            color = BOX_COLORS[label]
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"{label} {confidence:.2f}",
                        (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        total_in_frame = sum(frame_counts.values())
        all_frame_counts.append(total_in_frame)

        # Overlay: lane name + frame count
        cv2.putText(frame, f"{lane_name}  |  Vehicles: {total_in_frame}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 255, 255), 2)

        # Overlay: per-type breakdown
        y = 60
        for vtype, cnt in frame_counts.items():
            cv2.putText(frame, f"{vtype}: {cnt}", (10, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
            y += 22

        # Progress bar overlay
        if total_frames > 0:
            progress = int((frame_num / total_frames) * width)
            cv2.rectangle(frame, (0, height - 8), (progress, height), (0, 200, 0), -1)

        out.write(frame)

        cv2.imshow(f"Detection - {lane_name}", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            
            break

        # Terminal progress every 20 frames
        if frame_num % 20 == 0:
            pct = round(frame_num / total_frames * 100) if total_frames > 0 else "?"
            print(f"  {lane_name} — Frame {frame_num}/{total_frames} ({pct}%) | "
                  f"Vehicles this frame: {total_in_frame}")

    cap.release()
    out.release()

    # ── Compute summary stats ──────────────────────────────
    avg_vehicles  = round(sum(all_frame_counts) / max(len(all_frame_counts), 1), 2)
    peak_vehicles = max(all_frame_counts) if all_frame_counts else 0

    summary = {
        "lane":           lane_name,
        "video_path":     video_path,
        "total_frames":   frame_num,
        "avg_vehicles":   avg_vehicles,
        "peak_vehicles":  peak_vehicles,
        "type_counts":    total_type_counts,
        "frame_counts":   all_frame_counts,   # per-frame data for charts
        "output_video":   out_path,
    }

    print(f"\n  ✅ {lane_name} Done!")
    print(f"     Avg vehicles/frame : {avg_vehicles}")
    print(f"     Peak vehicles      : {peak_vehicles}")
    print(f"     Type breakdown     : {total_type_counts}")
    print(f"     Output saved       : {out_path}")

    return summary


def run_all_lanes():
    """
    Process all lane videos and return combined detection results.
    This result dict is passed to Module 3 (density) and Module 6 (signal timing).
    """
    print("=" * 60)
    print("  MODULE 1 — Multi-Lane Vehicle Detection")
    print("=" * 60)

    print("\n[INFO] Loading YOLOv8 model (downloads on first run)...")
    model = YOLO("yolov8n.pt")
    print("[INFO] Model ready.\n")

    all_results = {}

    for lane_name, video_path in LANE_VIDEOS.items():
        if not os.path.exists(video_path):
            print(f"[WARNING] Video not found, skipping: {video_path}")
            continue

        result = detect_lane(model, lane_name, video_path)
        if result:
            all_results[lane_name] = result

    # ── Final summary table ────────────────────────────────
    print("\n" + "=" * 60)
    print("  DETECTION SUMMARY — ALL LANES")
    print("=" * 60)
    print(f"  {'Lane':<10} {'Avg Vehicles':>14} {'Peak':>8} {'Frames':>8}")
    print("  " + "-" * 44)
    for lane, r in all_results.items():
        print(f"  {lane:<10} {r['avg_vehicles']:>14} {r['peak_vehicles']:>8} {r['total_frames']:>8}")

    print("\n[INFO] Module 1 complete. Results ready for Module 2 & 3.")
    return all_results   # passed into next modules


# ── RUN ───────────────────────────────────────────────────
if __name__ == "__main__":
    results = run_all_lanes()

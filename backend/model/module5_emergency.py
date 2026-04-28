import os
import cv2
import numpy as np
import pandas as pd
from ultralytics import YOLO
from datetime import datetime

# ─────────────────────────────────────────────────────────
# MODULE 5 — Emergency Vehicle Detection
# Uses YOLOv8 pretrained + HSV color analysis to detect:
#   - Ambulance  → Blue box
#   - Fire Truck → Orange box
#   - Police Car → Magenta box
# Shows live detection window + saves output video
# ─────────────────────────────────────────────────────────

# ── SETTINGS ──────────────────────────────────────────────
EMERGENCY_VIDEOS = {
    "Ambulance": "ambulance.mp4",
    "Fire Truck": "fire_truck.mp4",
    "Police":     "police.mp4"
}

OUTPUT_DIR         = "emergency_output"
EMERGENCY_LOG_PATH = "emergency_output/emergency_log.csv"

CONFIDENCE_THRESHOLD = 0.4
EMERGENCY_CONFIDENCE = 0.35
EMERGENCY_GREEN_TIME = 60
EMERGENCY_COOLDOWN   = 30

VEHICLE_CLASSES = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}

# Unique color per emergency type (BGR format)
EMERGENCY_COLORS = {
    "Ambulance":  (255, 0,   0),    # Blue
    "Fire Truck": (0,   69,  255),  # Orange
    "Police Car": (255, 0,   255),  # Magenta
}
DEFAULT_EMG_COLOR = (0, 0, 255)     # Red fallback


# ── EMERGENCY DETECTION LOGIC ─────────────────────────────

def is_emergency_vehicle(frame, box, class_id, label):
    """
    HSV color analysis on detected bounding box.
    Ambulance  = bus  + red AND blue together (Malaysian ambulance pattern)
    Fire Truck = truck/bus + red dominant
    Police Car = car  + blue markings
    """
    x1, y1, x2, y2 = map(int, box)
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)

    if x2 <= x1 or y2 <= y1:
        return False, "Unknown"

    vehicle_roi = frame[y1:y2, x1:x2]
    if vehicle_roi.size == 0:
        return False, "Unknown"

    hsv   = cv2.cvtColor(vehicle_roi, cv2.COLOR_BGR2HSV)
    total = max(vehicle_roi.size / 3, 1)

    # Red detection
    red_mask1 = cv2.inRange(hsv, np.array([0,   120, 70]),
                                  np.array([10,  255, 255]))
    red_mask2 = cv2.inRange(hsv, np.array([170, 120, 70]),
                                  np.array([180, 255, 255]))
    red_ratio = (cv2.countNonZero(red_mask1) +
                 cv2.countNonZero(red_mask2)) / total

    # Blue detection
    blue_mask  = cv2.inRange(hsv, np.array([100, 120, 70]),
                                   np.array([130, 255, 255]))
    blue_ratio = cv2.countNonZero(blue_mask) / total

    # White detection
    white_mask  = cv2.inRange(hsv, np.array([0,   0,  200]),
                                    np.array([180, 30, 255]))
    white_ratio = cv2.countNonZero(white_mask) / total

    # Yellow detection
    yellow_mask  = cv2.inRange(hsv, np.array([15, 100, 100]),
                                     np.array([35, 255, 255]))
    yellow_ratio = cv2.countNonZero(yellow_mask) / total

    # ── AMBULANCE — bus class ──────────────────────────────
    # Malaysian ambulance: white body + red AND blue markings
    # Debug confirmed: bus with red~0.03 AND blue~0.05 consistently
    if class_id == 5:
        if red_ratio > 0.02 and blue_ratio > 0.03:      # Red + Blue combo
            return True, "Ambulance"
        if white_ratio > 0.30:                          # Mostly white body
            return True, "Ambulance"
        if red_ratio > 0.20 and white_ratio > 0.20:     # White + red cross
            return True, "Ambulance"
        if yellow_ratio > 0.15 and white_ratio > 0.25:  # White + yellow stripe
            return True, "Ambulance"

    # ── FIRE TRUCK — truck or bus class, red dominant ──────
    if class_id == 7 and red_ratio > 0.25:
        return True, "Fire Truck"
    if class_id == 5 and red_ratio > 0.25 and blue_ratio < 0.02:
        return True, "Fire Truck"

    # ── POLICE CAR — car class, blue markings ─────────────
    if class_id == 2:
        if blue_ratio > 0.15:
            return True, "Police Car"
        if white_ratio > 0.30 and blue_ratio > 0.08:
            return True, "Police Car"

    return False, "Unknown"


# ── SIGNAL CONTROLLER ─────────────────────────────────────

class SignalController:
    def __init__(self, lane_names):
        self.lanes            = lane_names
        self.emergency_active = False
        self.emergency_lane   = None
        self.cooldown_counter = 0
        self.event_log        = []

    def trigger_emergency(self, lane_name, vehicle_type, frame_num):
        if not self.emergency_active:
            print(f"\n  🚨 EMERGENCY — {vehicle_type} in {lane_name}!")
            print(f"     → Immediate GREEN | All others RED")
            self.emergency_active = True
            self.emergency_lane   = lane_name
            self.cooldown_counter = EMERGENCY_COOLDOWN
            self.event_log.append({
                "frame":        frame_num,
                "lane":         lane_name,
                "vehicle_type": vehicle_type,
                "action":       "EMERGENCY GREEN OVERRIDE",
                "timestamp":    datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })

    def update(self):
        if self.emergency_active:
            self.cooldown_counter -= 1
            if self.cooldown_counter <= 0:
                print(f"\n  ✅ Emergency cleared — resuming normal timing")
                self.emergency_active = False
                self.emergency_lane   = None

    def get_signal(self, lane_name, normal_green_time):
        if self.emergency_active:
            if lane_name == self.emergency_lane:
                return "GREEN", EMERGENCY_GREEN_TIME
            else:
                return "RED", 0
        return "NORMAL", normal_green_time

    def save_log(self):
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        if self.event_log:
            df = pd.DataFrame(self.event_log)
            df.to_csv(EMERGENCY_LOG_PATH, index=False)
            print(f"\n[INFO] Emergency log saved: {EMERGENCY_LOG_PATH}")
            print(df.to_string(index=False))
        else:
            print("\n[INFO] No emergency vehicles detected.")


# ── PROCESS VIDEO ─────────────────────────────────────────

def process_video(yolo_model, lane_name, video_path, signal_controller):
    """Process video — detect emergency vehicles + show live window."""
    print(f"\n[INFO] Processing — {lane_name} | {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open: {video_path}")
        return []

    width        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps          = int(cap.get(cv2.CAP_PROP_FPS)) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Output video
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(
        OUTPUT_DIR, f"module5_{lane_name.replace(' ', '_')}.mp4")
    writer = cv2.VideoWriter(
        out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))

    # Display window
    window_name = f"Module 5 — {lane_name}"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 960, 540)
    print(f"  [DISPLAY] Press Q to skip to next video")

    frame_num   = 0
    results_log = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_num += 1
        if frame_num % 3 != 0:
            writer.write(frame)
            continue

        emergency_found = False
        emergency_type  = None
        results         = yolo_model(frame, verbose=False)[0]

        for box in results.boxes:
            class_id   = int(box.cls[0])
            confidence = float(box.conf[0])

            if class_id not in VEHICLE_CLASSES or confidence < EMERGENCY_CONFIDENCE:
                continue

            label           = VEHICLE_CLASSES[class_id]
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            is_emergency, emg_type = is_emergency_vehicle(
                frame, (x1, y1, x2, y2), class_id, label)

            if is_emergency:
                emergency_found = True
                emergency_type  = emg_type
                signal_controller.trigger_emergency(
                    lane_name, emg_type, frame_num)

                # Unique color per emergency type
                emg_color  = EMERGENCY_COLORS.get(emg_type, DEFAULT_EMG_COLOR)
                label_text = f"EMERGENCY: {emg_type}"

                # Thick colored border
                cv2.rectangle(frame, (x1, y1), (x2, y2), emg_color, 4)

                # Colored label background
                (tw, th), _ = cv2.getTextSize(
                    label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)
                cv2.rectangle(frame,
                             (x1, max(y1 - th - 10, 0)),
                             (x1 + tw + 5, max(y1, th + 10)),
                             emg_color, -1)
                cv2.putText(frame, label_text,
                           (x1, max(y1 - 5, 20)),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                           (255, 255, 255), 2)

            else:
                # Normal vehicle — green box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame, f"{label} {confidence:.2f}",
                           (x1, max(y1 - 5, 15)),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                           (0, 255, 0), 1)

        # Signal state
        signal_controller.update()
        signal_state, green_time = signal_controller.get_signal(lane_name, 30)

        # Top status bar
        if signal_controller.emergency_active:
            if lane_name == signal_controller.emergency_lane:
                bar_color = (0, 200, 0)
                bar_text  = f"EMERGENCY GREEN — {EMERGENCY_GREEN_TIME}s"
            else:
                bar_color = (0, 0, 200)
                bar_text  = "RED — EMERGENCY IN OTHER LANE"
        else:
            bar_color = (0, 200, 200)
            bar_text  = f"NORMAL | Green: {green_time}s"

        cv2.rectangle(frame, (0, 0), (width, 55), (0, 0, 0), -1)
        cv2.putText(frame, f"{lane_name}  |  {bar_text}",
                   (10, 38), cv2.FONT_HERSHEY_SIMPLEX,
                   0.9, bar_color, 2)

        # Frame counter
        cv2.putText(frame, f"Frame: {frame_num}/{total_frames}",
                   (width - 220, height - 15),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

        # Color legend bottom left
        legend_items = [
            ("Ambulance",  EMERGENCY_COLORS["Ambulance"]),
            ("Fire Truck", EMERGENCY_COLORS["Fire Truck"]),
            ("Police Car", EMERGENCY_COLORS["Police Car"]),
            ("Normal",     (0, 255, 0)),
        ]
        for i, (leg_label, leg_color) in enumerate(legend_items):
            y_pos = height - 90 + (i * 22)
            cv2.rectangle(frame, (10, y_pos), (25, y_pos + 15),
                         leg_color, -1)
            cv2.putText(frame, leg_label, (30, y_pos + 13),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                       (255, 255, 255), 1)

        # Show + save
        cv2.imshow(window_name, frame)
        writer.write(frame)

        results_log.append({
            "lane":      lane_name,
            "frame":     frame_num,
            "emergency": emergency_found,
            "emg_type":  emergency_type or "None",
            "signal":    signal_state,
        })

        if frame_num % 100 == 0:
            pct    = round(frame_num / total_frames * 100) if total_frames else "?"
            status = f"🚨 {emergency_type}" if emergency_found else "✅ Clear"
            print(f"  Frame {frame_num} ({pct}%) | "
                  f"Signal:{signal_state} | {status}")

        if cv2.waitKey(1) & 0xFF == ord("q"):
            print(f"  [SKIP] Skipping to next video...")
            break

    cap.release()
    writer.release()
    cv2.destroyWindow(window_name)
    print(f"  ✅ Done | Saved: {out_path}")
    return results_log


# ── MAIN ──────────────────────────────────────────────────

def run_module5():
    print("=" * 60)
    print("  MODULE 5 — Emergency Vehicle Detection")
    print("=" * 60)

    print("\n[INFO] Loading YOLOv8 model...")
    yolo_model = YOLO("yolov8n.pt")
    print("[INFO] YOLOv8 ready.\n")

    signal_controller = SignalController(list(EMERGENCY_VIDEOS.keys()))

    all_results = []
    for lane_name, video_path in EMERGENCY_VIDEOS.items():
        if not os.path.exists(video_path):
            print(f"[WARNING] Skipping — not found: {video_path}")
            continue
        results = process_video(
            yolo_model, lane_name, video_path, signal_controller)
        all_results.extend(results)

    cv2.destroyAllWindows()

    # Summary
    print("\n" + "=" * 60)
    print("  MODULE 5 — SUMMARY")
    print("=" * 60)

    total_frames     = len(all_results)
    emergency_frames = sum(1 for r in all_results if r["emergency"])

    print(f"\n[RESULT] Frames processed    : {total_frames}")
    print(f"[RESULT] Emergency detections: {emergency_frames}")
    print(f"[RESULT] Emergency events    : {len(signal_controller.event_log)}")

    if signal_controller.event_log:
        print("\n[RESULT] Emergency Events:")
        for event in signal_controller.event_log:
            print(f"  🚨 {event['vehicle_type']} | {event['lane']} | "
                  f"Frame {event['frame']} | {event['timestamp']}")
    else:
        print("\n[RESULT] No emergency vehicles detected.")
        print("         Adjust color thresholds if missing detections.")

    signal_controller.save_log()
    print("\n[INFO] Module 5 complete. Ready for Module 6.")


if __name__ == "__main__":
    run_module5()
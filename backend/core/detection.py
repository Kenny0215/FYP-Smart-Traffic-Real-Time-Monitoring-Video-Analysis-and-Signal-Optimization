"""
core/detection.py
YOLO + DeepSort lane processing, overlay drawing, auto-save thread.
"""
import os
import sys
import cv2
import time
import joblib
import numpy as np
import pandas as pd
import threading
import queue
from datetime import datetime

from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

from core.state import (
    LANE_CONFIG, UPLOAD_FOLDER,
    CONFIDENCE_THRESHOLD, VEHICLE_CLASSES, PIXELS_PER_METER,
    SPEED_SAMPLE_FRAMES, CONG_HIGH, CONG_MEDIUM, PROCESS_EVERY_N,
    COLORS, CONG_COLORS, SIGNAL_COLORS, VEHICLE_TYPE_COLORS_BGR,
    RED_VIOLATION_SECONDS,
    frame_queues, lane_stats, stats_lock, yolo_lock,
    active_videos, stop_flags,
    live_emergency_log, emergency_lock,
    violation_tracker, violation_lock,
)
from core.signal import signal_controller
from core.anpr   import read_plate, file_complaint
from fuzzy_controller import (
    FuzzyGreenTimeController, calculate_priority_score,
    coordinate_green_times, MIN_GREEN, MAX_GREEN,
)

MODEL_DIR          = os.path.join(os.path.dirname(__file__), "..", "model")
CONGESTION_MODEL_PKL = os.path.join(MODEL_DIR, "model_output", "congestion_model.pkl")
YOLO_MODEL_PATH    = os.path.join(MODEL_DIR, "yolov8n.pt")

# ── Load models ───────────────────────────────────────────
print("[INFO] Loading YOLO model...")
yolo_model = YOLO(YOLO_MODEL_PATH)
print("[INFO] YOLO ready.")

fuzzy_ctrl  = FuzzyGreenTimeController()
rf_model    = None
le_priority = None
le_cong     = None

if os.path.exists(CONGESTION_MODEL_PKL):
    try:
        saved       = joblib.load(CONGESTION_MODEL_PKL)
        rf_model    = saved["model"]
        le_priority = saved["le_priority"]
        le_cong     = saved.get("le_congestion")
        print("[INFO] RF model loaded.")
    except Exception as e:
        print(f"[WARN] RF model load failed: {e}")


# ── Helpers ───────────────────────────────────────────────

def calculate_density(vehicle_count, w, h):
    road_area = w * h * 0.67
    return round((vehicle_count / max(road_area, 1)) * 10000, 4)


def classify_congestion(vehicle_count):
    if vehicle_count >= CONG_HIGH:     return "High"
    elif vehicle_count >= CONG_MEDIUM: return "Medium"
    else:                              return "Low"


def predict_priority(vehicle_count, density, heavy_ratio, avg_speed, congestion):
    if congestion == "High" or vehicle_count >= CONG_HIGH:
        return "High"
    if congestion == "Medium" or vehicle_count >= CONG_MEDIUM:
        if rf_model is not None:
            try:
                cong_enc = le_cong.transform([congestion])[0] \
                           if le_cong else \
                           {"Low": 0, "Medium": 1, "High": 2}[congestion]
                features = pd.DataFrame(
                    [[vehicle_count, density, heavy_ratio, avg_speed, cong_enc]],
                    columns=["vehicle_count", "density", "heavy_ratio",
                             "avg_speed", "congestion_enc"])
                pred      = rf_model.predict(features)[0]
                rf_result = le_priority.inverse_transform([pred])[0]
                return rf_result if rf_result != "Low" else "Medium"
            except Exception:
                pass
        return "Medium"
    if rf_model is not None:
        try:
            cong_enc = le_cong.transform([congestion])[0] \
                       if le_cong else \
                       {"Low": 0, "Medium": 1, "High": 2}[congestion]
            features = pd.DataFrame(
                [[vehicle_count, density, heavy_ratio, avg_speed, cong_enc]],
                columns=["vehicle_count", "density", "heavy_ratio",
                         "avg_speed", "congestion_enc"])
            pred = rf_model.predict(features)[0]
            return le_priority.inverse_transform([pred])[0]
        except Exception:
            pass
    return "Low"


def draw_overlay(frame, stats, fps):
    h, w    = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 120), (10, 10, 10), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    cv2.putText(frame,
                f"{stats['lane']}  |  Frame {stats['frame']}  |  {fps:.1f} FPS",
                (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (200, 200, 200), 1)
    cv2.putText(frame,
                f"Vehicles:{stats['vehicle_count']}  "
                f"Spd:{stats['avg_speed']:.0f}km/h  "
                f"Fuzzy:{stats.get('green_time', 0)}s  "
                f"Coord:{stats.get('coordinated_green', 0)}s  "
                f"Score:{stats.get('priority_score', 0.0):.0f}",
                (10, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (200, 200, 200), 1)

    vt    = stats.get("vehicle_types", {})
    x_pos = 10
    for label, count in vt.items():
        color = VEHICLE_TYPE_COLORS_BGR.get(label, (200, 200, 200))
        text  = f"{label}:{count}"
        cv2.putText(frame, text, (x_pos, 72),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.44, color, 1)
        x_pos += len(text) * 9 + 8

    cv2.putText(frame, f"Priority: {stats['priority']}",
                (10, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (200, 200, 200), 1)

    cong_color = CONG_COLORS.get(stats["congestion"], (255, 255, 255))
    cv2.rectangle(frame, (w-120, 6),  (w-6, 42), cong_color, -1)
    cv2.putText(frame, stats["congestion"], (w-112, 32),
                cv2.FONT_HERSHEY_SIMPLEX, 0.72, (255, 255, 255), 2)

    sig_state = stats.get("signal_state", "red")
    sig_color = SIGNAL_COLORS.get(sig_state, (0, 0, 220))
    cv2.rectangle(frame, (w-120, 50), (w-6, 78), sig_color, -1)
    cv2.putText(frame, sig_state.upper(), (w-115, 70),
                cv2.FONT_HERSHEY_SIMPLEX, 0.56, (255, 255, 255), 2)

    remaining = signal_controller.remaining_green
    if sig_state == "green" and remaining > 0:
        cv2.putText(frame, f"{remaining:.0f}s",
                    (w-115, 112), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 220, 80), 1)
    return frame


# ── Auto-save to Supabase ─────────────────────────────────

def auto_save_to_supabase(supabase):
    print("[AUTO-SAVE] Background save thread started.")
    while True:
        time.sleep(5)
        try:
            with stats_lock:
                current_stats = {k: dict(v) for k, v in lane_stats.items()}
            rows = []
            for lane_key, stats in current_stats.items():
                if stats["vehicle_count"] > 0 or stats["frame"] > 0:
                    vt       = stats.get("vehicle_types", {})
                    dominant = max(vt, key=vt.get) if vt and any(vt.values()) else "None"
                    rows.append({
                        "lane_name":             stats["lane"],
                        "frame":                 stats["frame"],
                        "vehicle_count":         stats["vehicle_count"],
                        "density":               stats["density"],
                        "heavy_ratio":           stats["heavy_ratio"],
                        "avg_speed":             stats["avg_speed"],
                        "congestion":            stats["congestion"],
                        "ai_green_time":         stats["green_time"],
                        "coordinated_green":     stats.get("coordinated_green", stats["green_time"]),
                        "priority_score":        stats.get("priority_score", 0.0),
                        "priority_level":        stats["priority"],
                        "signal_state":          stats.get("signal_state", "red"),
                        "car_count":             vt.get("Car", 0),
                        "motorcycle_count":      vt.get("Motorcycle", 0),
                        "bus_count":             vt.get("Bus", 0),
                        "truck_count":           vt.get("Truck", 0),
                        "dominant_vehicle_type": dominant,
                        "timestamp": datetime.now().astimezone().isoformat()
                    })
            if rows:
                supabase.table("lane_status").insert(rows).execute()
                print(f"[AUTO-SAVE] Saved {len(rows)} rows.")
        except Exception as e:
            print(f"[AUTO-SAVE] Error: {e}")


# ── MJPEG generator ───────────────────────────────────────

def mjpeg_generator(lane_key):
    q = frame_queues.get(lane_key)
    if q is None:
        return
    while True:
        try:
            jpeg = q.get(timeout=2.0)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n")
        except queue.Empty:
            blank = np.zeros((360, 640, 3), dtype=np.uint8)
            cv2.putText(blank, "Waiting for stream...",
                        (160, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 1)
            _, buf = cv2.imencode(".jpg", blank)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")


# ── Main lane processing thread ───────────────────────────

def process_lane(lane_key, video_path, display_name, supabase):
    print(f"[THREAD] Starting — {display_name}")

    local_stats = {
        "lane":          display_name,
        "vehicle_count": 0,
        "congestion":    "Low",
        "green_time":    MIN_GREEN,
        "priority":      "Low",
        "avg_speed":     0.0,
        "density":       0.0,
        "heavy_ratio":   0.0,
        "frame":         0,
        "fps":           0.0,
        "vehicle_types": {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0},
        "signal_state":  "red",
    }

    while True:
        if stop_flags.get(lane_key, False):
            print(f"[THREAD] {display_name} — stop flag, exiting.")
            return

        tracker              = DeepSort(max_age=30, n_init=1, max_iou_distance=0.7)
        id_positions         = {}
        id_speeds            = {}
        emergency_logged_ids = set()
        frame_num            = 0
        prev_time            = time.time()
        last_boxes           = []

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"[ERROR] Cannot open: {video_path}")
            time.sleep(5)
            continue

        width     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height    = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        video_fps = int(cap.get(cv2.CAP_PROP_FPS)) or 25
        frame_sleep = 1.0 / video_fps

        while True:
            if stop_flags.get(lane_key, False):
                cap.release()
                return

            ret, frame = cap.read()
            if not ret:
                break

            frame     = cv2.resize(frame, (640, 360))
            frame_num += 1
            local_stats["frame"] = frame_num

            if frame_num % PROCESS_EVERY_N == 0:
                with yolo_lock:
                    results = yolo_model(frame, verbose=False, imgsz=320)[0]

                detections = []
                for box in results.boxes:
                    class_id   = int(box.cls[0])
                    confidence = float(box.conf[0])
                    if class_id not in VEHICLE_CLASSES or confidence < CONFIDENCE_THRESHOLD:
                        continue
                    label = VEHICLE_CLASSES[class_id]
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    detections.append(([x1, y1, x2-x1, y2-y1], confidence, label))

                tracks            = tracker.update_tracks(detections, frame=frame)
                speed_list        = []
                active            = 0
                new_boxes         = []
                track_type_counts = {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0}

                for track in tracks:
                    if not track.is_confirmed():
                        continue
                    active   += 1
                    track_id  = track.track_id
                    x1, y1, x2, y2 = map(int, track.to_ltrb())
                    cx, cy    = (x1+x2)//2, (y1+y2)//2
                    label     = track.det_class if hasattr(track, "det_class") else "Vehicle"
                    box_color = COLORS.get(label, (0, 255, 255))

                    if label in track_type_counts:
                        track_type_counts[label] += 1

                    cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
                    cv2.putText(frame, f"{label} #{track_id}",
                                (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.42, box_color, 1)

                    if track_id in id_positions:
                        pcx, pcy, pf = id_positions[track_id]
                        fd = frame_num - pf
                        if fd >= SPEED_SAMPLE_FRAMES:
                            dist = ((cx-pcx)**2 + (cy-pcy)**2) ** 0.5
                            m    = dist / PIXELS_PER_METER
                            s    = fd / video_fps
                            id_speeds[track_id]    = round((m/s)*3.6, 1)
                            id_positions[track_id] = (cx, cy, frame_num)
                    else:
                        id_positions[track_id] = (cx, cy, frame_num)

                    spd = id_speeds.get(track_id)
                    if spd:
                        speed_list.append(spd)
                        cv2.putText(frame, f"{spd:.0f}km/h",
                                    (x1, y2+13), cv2.FONT_HERSHEY_SIMPLEX,
                                    0.36, (200, 200, 0), 1)
                    new_boxes.append((x1, y1, x2, y2, label, track_id, spd))

                last_boxes  = new_boxes
                heavy_count = track_type_counts["Bus"] + track_type_counts["Truck"]
                heavy_ratio = round(heavy_count / max(active, 1), 3)
                avg_speed   = round(sum(speed_list) / max(len(speed_list), 1), 1)
                density     = calculate_density(active, width, height)
                congestion  = classify_congestion(active)
                green_time  = fuzzy_ctrl.calculate(active, avg_speed, heavy_ratio, congestion)
                priority    = predict_priority(active, density, heavy_ratio, avg_speed, congestion)
                p_score     = calculate_priority_score(active, density, heavy_ratio, avg_speed, congestion)

                # Emergency vehicle detection
                emergency_detected = False
                for (bx1, by1, bx2, by2, blabel, btrack_id, _) in new_boxes:
                    if blabel == "Bus":
                        box_w = bx2 - bx1
                        box_h = by2 - by1
                        if box_w > width * 0.25 or box_h > height * 0.25:
                            emergency_detected = True
                            log_key = f"{lane_key}_{btrack_id}"
                            if log_key not in emergency_logged_ids:
                                emergency_logged_ids.add(log_key)
                                entry = {
                                    "id":        len(live_emergency_log) + 1,
                                    "type":      "Ambulance",
                                    "lane":      display_name,
                                    "action":    "Priority Override — Green Extended",
                                    "frame":     frame_num,
                                    "timestamp": datetime.now().isoformat(),
                                }
                                with emergency_lock:
                                    live_emergency_log.append(entry)
                                signal_controller.emergency_override(lane_key)

                if emergency_detected:
                    priority   = "High"
                    green_time = MAX_GREEN

                # ── VIOLATION DETECTION ───────────────────────────
                # 3 violation types:
                #   1. Red Light  — moving ≥ 30 km/h on red signal
                #   2. Speeding   — moving ≥ 80 km/h on any signal
                #   3. Overloaded — Bus/Truck box width > 40% of frame

                SPEED_LIMIT_KMH      = 80   # speeding threshold
                RED_LIGHT_KMH        = 30   # red light running threshold
                OVERLOAD_WIDTH_RATIO = 0.40 # box width / frame width

                lane_signal = signal_controller.get_state().get(lane_key, "red")
                now_ts      = time.time()

                for (vx1, vy1, vx2, vy2, vlabel, vtrack_id, vspd) in new_boxes:
                    violation = None  # (violation_type, color)

                    # ── Check 1: Speeding (any signal state) ──────
                    if vspd is not None and vspd >= SPEED_LIMIT_KMH:
                        violation = ("Speeding", (0, 140, 255))  # orange

                    # ── Check 2: Red Light Running ────────────────
                    elif (lane_signal == "red"
                          and vspd is not None
                          and vspd >= RED_LIGHT_KMH):
                        violation = ("Red Light Violation", (0, 0, 255))  # red

                    # ── Check 3: Overloaded Vehicle ───────────────
                    elif (vlabel in ("Bus", "Truck")
                          and (vx2 - vx1) / max(width, 1) >= OVERLOAD_WIDTH_RATIO):
                        violation = ("Overloaded Vehicle", (0, 60, 200))  # dark red

                    if violation is None:
                        continue

                    violation_type, vcolor = violation

                    # Track this vehicle for the required dwell time
                    vid_key = f"{lane_key}_{vtrack_id}_{violation_type}"
                    with violation_lock:
                        if vid_key not in violation_tracker[lane_key]:
                            violation_tracker[lane_key][vid_key] = now_ts
                            continue
                        elapsed = now_ts - violation_tracker[lane_key][vid_key]

                    if elapsed < RED_VIOLATION_SECONDS:
                        continue

                    # ── Confirmed violation ───────────────────────
                    plate = read_plate(frame, vx1, vy1, vx2, vy2)

                    # Build annotated snapshot
                    snapshot = frame.copy()
                    overlay  = snapshot.copy()
                    cv2.rectangle(overlay, (0, 0),
                                  (snapshot.shape[1], snapshot.shape[0]),
                                  (0, 0, 0), -1)
                    cv2.addWeighted(overlay, 0.35, snapshot, 0.65, 0, snapshot)

                    # Thick colored bounding box
                    cv2.rectangle(snapshot, (vx1, vy1), (vx2, vy2), vcolor, 4)

                    # Label background + text
                    spd_str    = f"  {vspd:.0f} km/h" if vspd else ""
                    label_text = f"{violation_type}  {plate}{spd_str}"
                    (tw, th), _ = cv2.getTextSize(
                        label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
                    lx = vx1
                    ly = max(th + 10, vy1 - 10)
                    cv2.rectangle(snapshot,
                                  (lx, ly - th - 8),
                                  (lx + tw + 10, ly + 4),
                                  vcolor, -1)
                    cv2.putText(snapshot, label_text, (lx + 5, ly),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                                (255, 255, 255), 2)

                    # Arrows pointing to vehicle
                    cv2.arrowedLine(snapshot,
                                    (vx1 - 20, vy1 - 20), (vx1 + 5, vy1 + 5),
                                    vcolor, 2, tipLength=0.4)
                    cv2.arrowedLine(snapshot,
                                    (vx2 + 20, vy1 - 20), (vx2 - 5, vy1 + 5),
                                    vcolor, 2, tipLength=0.4)

                    # Timestamp watermark
                    ts_text = f"{display_name}  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                    cv2.putText(snapshot, ts_text,
                                (8, snapshot.shape[0] - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.42,
                                (200, 200, 200), 1)

                    # File complaint (skips UNKNOWN plates automatically)
                    file_complaint(
                        supabase, snapshot,
                        lane_key, display_name,
                        plate, vlabel, vtrack_id,
                        violation_type=violation_type,
                        speed=vspd or 0.0,
                    )

                    # Draw on live stream
                    cv2.rectangle(frame, (vx1, vy1), (vx2, vy2), vcolor, 3)
                    cv2.putText(frame, f"{violation_type[:8]} {plate}",
                                (vx1, max(0, vy1 - 10)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, vcolor, 2)

                    with violation_lock:
                        del violation_tracker[lane_key][vid_key]

                # Clear red-light timers when signal is green/yellow
                if lane_signal != "red":
                    with violation_lock:
                        keys_to_del = [k for k in violation_tracker[lane_key]
                                       if "Red Light" in k]
                        for k in keys_to_del:
                            del violation_tracker[lane_key][k]
                    from core.anpr import clear_complaints_for_lane
                    clear_complaints_for_lane(lane_key)
                # ── END VIOLATION DETECTION ────────────────────────

                local_stats.update({
                    "vehicle_count":  active,
                    "congestion":     congestion,
                    "green_time":     green_time,
                    "priority":       priority,
                    "priority_score": p_score,
                    "avg_speed":      avg_speed,
                    "density":        density,
                    "heavy_ratio":    heavy_ratio,
                    "vehicle_types":  dict(track_type_counts),
                })

                with stats_lock:
                    lane_stats[lane_key].update(local_stats)

                with stats_lock:
                    snapshot = {k: dict(v) for k, v in lane_stats.items()}

                coordinated, _ = coordinate_green_times(snapshot)
                with stats_lock:
                    for lk, cgt in coordinated.items():
                        lane_stats[lk]["coordinated_green"] = cgt

                sig_states = signal_controller.get_state()
                local_stats["signal_state"] = sig_states.get(lane_key, "red")
                with stats_lock:
                    lane_stats[lane_key]["signal_state"] = local_stats["signal_state"]

            else:
                for (x1, y1, x2, y2, label, track_id, spd) in last_boxes:
                    box_color = COLORS.get(label, (0, 255, 255))
                    cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
                    cv2.putText(frame, f"{label} #{track_id}",
                                (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.42, box_color, 1)
                    if spd:
                        cv2.putText(frame, f"{spd:.0f}km/h",
                                    (x1, y2+13), cv2.FONT_HERSHEY_SIMPLEX,
                                    0.36, (200, 200, 0), 1)

            curr_time = time.time()
            fps       = 1.0 / max(curr_time - prev_time, 0.001)
            prev_time = curr_time
            local_stats["fps"] = round(fps, 1)

            frame = draw_overlay(frame, local_stats, fps)

            _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            jpeg = buffer.tobytes()

            q = frame_queues[lane_key]
            if q.full():
                try:   q.get_nowait()
                except queue.Empty: pass
            try:
                q.put_nowait(jpeg)
            except queue.Full:
                pass

            time.sleep(frame_sleep)

        cap.release()
        print(f"[THREAD] {display_name} — video ended, looping...")
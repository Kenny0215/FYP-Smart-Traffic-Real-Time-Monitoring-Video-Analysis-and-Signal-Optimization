import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.preprocessing import LabelEncoder
import joblib
import cv2
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

# ─────────────────────────────────────────────────────────
# MODULE 4 — Traffic Analysis + Signal Priority
#
# Part 1: Direct density classification (No ML)
# Part 2: Rule-based green time per lane
# Part 3: Random Forest → predicts which lane gets priority
#
# Output: congestion_model.pkl → used in Module 6 + 7
# ─────────────────────────────────────────────────────────

# ── SETTINGS ──────────────────────────────────────────────
LANE_VIDEOS = {
    "Lane A": "traffic A.mp4",
    "Lane B": "traffic B.mp4",
    "Lane C": "traffic C.mp4",
    "Lane D": "traffic D.mp4"
}

OUTPUT_DIR        = "model_output/"
MODEL_SAVE_PATH   = "model_output/congestion_model.pkl"
DATASET_SAVE_PATH = "model_output/training_data.csv"

CONFIDENCE_THRESHOLD = 0.4
VEHICLE_CLASSES      = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}
PIXELS_PER_METER     = 8.0
SPEED_SAMPLE_FRAMES  = 5

MIN_GREEN_TIME  = 10
MAX_GREEN_TIME  = 60
BASE_GREEN_TIME = 20


# ── PART 1: DIRECT DENSITY CLASSIFICATION ─────────────────

def calculate_density(vehicle_count, frame_width, frame_height):
    """
    Density = vehicles per road area.
    Road area = bottom 2/3 of frame.
    """
    road_area   = (frame_width * frame_height * 0.67)
    density_pct = (vehicle_count / max(road_area, 1)) * 10000
    return round(density_pct, 4)


def classify_congestion(density_pct):
    """
    Direct rule-based classification — no ML needed.
    Based on Nekouei (2024) density estimation approach.
    """
    if density_pct < 0.08:
        return "Low"
    elif density_pct < 0.16:
        return "Medium"
    else:
        return "High"


# ── PART 2: RULE-BASED GREEN TIME ─────────────────────────

def calculate_green_time(vehicle_count, congestion, avg_speed, heavy_ratio):
    """
    Webster-inspired adaptive signal timing formula.
    Deterministic — no ML, fully explainable.
    """
    if congestion == "High":
        base       = 40
        per_vehicle = 0.6
    elif congestion == "Medium":
        base       = 20
        per_vehicle = 0.8
    else:  # Low
        base       = 10
        per_vehicle = 0.5

    green_time = base + (vehicle_count * per_vehicle)

    # Speed penalty — slow traffic needs more green
    speed_factor = max(0, (40 - avg_speed) / 40)
    green_time  += speed_factor * 10

    # Heavy vehicle bonus
    green_time += heavy_ratio * 8

    return round(max(MIN_GREEN_TIME, min(MAX_GREEN_TIME, green_time)), 1)


# ── PART 3: LANE PRIORITY SCORE ───────────────────────────

def calculate_priority_score(vehicle_count, density_pct,
                             congestion, heavy_ratio):
    # Base from vehicle count
    score = vehicle_count * 2.0

    # Congestion multiplier
    multiplier = {"High": 3.0, "Medium": 2.0, "Low": 1.0}
    score *= multiplier.get(congestion, 1.0)

    # Heavy vehicles add urgency
    score += heavy_ratio * 20

    # Density adds urgency
    score += density_pct * 50

    # Max possible: 45 vehicles × 2 × 3.0 + 20 + 50 = 340
    MAX_POSSIBLE = 340.0
    normalized = round((score / MAX_POSSIBLE) * 100, 2)

    return normalized 


# ── FEATURE EXTRACTION ────────────────────────────────────

def extract_features(model, lane_name, video_path):
    """Extract per-frame features from lane video."""
    print(f"\n[INFO] Extracting features — {lane_name}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open: {video_path}")
        return []

    width        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps          = int(cap.get(cv2.CAP_PROP_FPS)) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    tracker      = DeepSort(max_age=30, n_init=3, max_iou_distance=0.7)
    id_positions = {}
    id_speeds    = {}
    rows         = []
    frame_num    = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_num += 1
        if frame_num % 5 != 0:
            continue

        results     = model(frame, verbose=False)[0]
        detections  = []
        type_counts = {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0}

        for box in results.boxes:
            class_id   = int(box.cls[0])
            confidence = float(box.conf[0])
            if class_id not in VEHICLE_CLASSES or confidence < CONFIDENCE_THRESHOLD:
                continue
            label = VEHICLE_CLASSES[class_id]
            type_counts[label] += 1
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            detections.append(([x1, y1, x2 - x1, y2 - y1], confidence, label))

        tracks       = tracker.update_tracks(detections, frame=frame)
        active_count = 0
        speed_list   = []

        for track in tracks:
            if not track.is_confirmed():
                continue
            active_count += 1
            track_id = track.track_id
            x1, y1, x2, y2 = map(int, track.to_ltrb())
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

            if track_id in id_positions:
                prev_cx, prev_cy, prev_frame = id_positions[track_id]
                frame_diff = frame_num - prev_frame
                if frame_diff >= SPEED_SAMPLE_FRAMES:
                    pixel_dist = ((cx - prev_cx)**2 + (cy - prev_cy)**2) ** 0.5
                    meters     = pixel_dist / PIXELS_PER_METER
                    seconds    = frame_diff / fps
                    speed_kmh  = (meters / seconds) * 3.6
                    id_speeds[track_id]    = round(speed_kmh, 1)
                    id_positions[track_id] = (cx, cy, frame_num)
            else:
                id_positions[track_id] = (cx, cy, frame_num)

            if track_id in id_speeds:
                speed_list.append(id_speeds[track_id])

        # ── Compute all metrics ────────────────────────────
        total_vehicles = max(active_count, 1)
        density_pct    = calculate_density(active_count, width, height)
        congestion     = classify_congestion(density_pct)
        heavy_count    = type_counts["Bus"] + type_counts["Truck"]
        heavy_ratio    = round(heavy_count / total_vehicles, 3)
        avg_speed      = round(sum(speed_list) / max(len(speed_list), 1), 1)
        green_time     = calculate_green_time(
                            active_count, congestion, avg_speed, heavy_ratio)
        priority_score = calculate_priority_score(
                            active_count, density_pct,
                            congestion, heavy_ratio)

        rows.append({
            "lane":           lane_name,
            "frame":          frame_num,
            "vehicle_count":  active_count,
            "density":        round(min(density_pct, 1.0), 4),
            "heavy_ratio":    heavy_ratio,
            "avg_speed":      avg_speed,
            "congestion":     congestion,
            "green_time":     green_time,      # rule-based output
            "priority_score": priority_score,  # RF training target
        })

        if frame_num % 100 == 0:
            pct = round(frame_num / total_frames * 100) if total_frames else "?"
            print(f"  {lane_name} — Frame {frame_num} ({pct}%) | "
                  f"Count:{active_count} | {congestion} | "
                  f"Green:{green_time}s | Priority:{priority_score}")

    cap.release()
    print(f"  ✅ {lane_name} — {len(rows)} rows extracted")
    return rows


# ── TRAIN RF LANE PRIORITY CLASSIFIER ────────────────────

def train_priority_model(all_rows):
    """
    Train RF to predict lane priority level:
    Low / Medium / High urgency based on traffic features.
    This tells the signal system which lane needs green most.
    """
    print("\n" + "=" * 60)
    print("  RANDOM FOREST — Lane Priority Classifier")
    print("=" * 60)

    df = pd.DataFrame(all_rows)

    # Convert priority score to priority level
    # Thresholds based on score distribution
    p33 = df["priority_score"].quantile(0.33)
    p66 = df["priority_score"].quantile(0.66)

    def score_to_level(score):
        if score <= p33:
            return "Low Priority"
        elif score <= p66:
            return "Medium Priority"
        else:
            return "High Priority"

    df["priority_level"] = df["priority_score"].apply(score_to_level)

    print(f"\n[INFO] Total samples : {len(df)}")
    print(f"\n[INFO] Congestion distribution:")
    print(df["congestion"].value_counts().to_string())
    print(f"\n[INFO] Priority distribution:")
    print(df["priority_level"].value_counts().to_string())
    print(f"\n[INFO] Green time range: "
          f"Min:{df['green_time'].min()}s | "
          f"Max:{df['green_time'].max()}s | "
          f"Mean:{round(df['green_time'].mean(),1)}s")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    df.to_csv(DATASET_SAVE_PATH, index=False)
    print(f"\n[INFO] Dataset saved: {DATASET_SAVE_PATH}")

    # Encode congestion
    le_cong = LabelEncoder()
    df["congestion_enc"] = le_cong.fit_transform(df["congestion"])

    # Encode priority label
    le_pri = LabelEncoder()
    y      = le_pri.fit_transform(df["priority_level"])

    FEATURES = ["vehicle_count", "density", "heavy_ratio",
                "avg_speed", "congestion_enc"]
    X = df[FEATURES]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, shuffle=True,
        stratify=y
    )

    print(f"\n[INFO] Training samples : {len(X_train)}")
    print(f"[INFO] Testing  samples : {len(X_test)}")

    # GridSearchCV
    print("\n[INFO] Running GridSearchCV...")
    param_grid = {
        "n_estimators":      [50, 100, 200],
        "max_depth":         [3, 5, 7],
        "min_samples_split": [5, 10, 20],
        "min_samples_leaf":  [2, 5, 10],
    }
    grid_search = GridSearchCV(
        RandomForestClassifier(random_state=42, class_weight="balanced"),
        param_grid, cv=5, scoring="f1_macro",
        n_jobs=-1, verbose=0
    )
    grid_search.fit(X_train, y_train)
    rf_model = grid_search.best_estimator_

    print(f"[INFO] Best parameters : {grid_search.best_params_}")

    # Cross validation
    cv_scores = cross_val_score(rf_model, X, y, cv=5, scoring="accuracy")
    print(f"[INFO] Cross-val       : {round(cv_scores.mean()*100,2)}% "
          f"(±{round(cv_scores.std()*100,2)}%)")

    # Test evaluation
    y_pred   = rf_model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\n[RESULT] Test Accuracy : {round(accuracy*100,2)}%")
    print("\n[RESULT] Classification Report:")
    print(classification_report(y_test, y_pred,
                                target_names=le_pri.classes_))
    print("[RESULT] Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Feature importance
    print("\n[RESULT] Feature Importance:")
    for feat, imp in sorted(zip(FEATURES, rf_model.feature_importances_),
                            key=lambda x: x[1], reverse=True):
        bar = "█" * int(imp * 40)
        print(f"  {feat:<20} {bar} {round(imp*100,1)}%")

    # Save model
    joblib.dump({
        "model":       rf_model,
        "le_priority": le_pri,
        "le_congestion": le_cong,
        "features":    FEATURES,
        "type":        "lane_priority_classifier"
    }, MODEL_SAVE_PATH)
    print(f"\n[INFO] Model saved: {MODEL_SAVE_PATH}")

    return rf_model, le_pri, le_cong


# ── PREDICT LANE STATUS ───────────────────────────────────

def predict_lane_status(vehicle_count, density, heavy_ratio,
                        avg_speed, congestion):

    saved    = joblib.load(MODEL_SAVE_PATH)
    model    = saved["model"]
    le_pri   = saved["le_priority"]
    le_cong  = saved["le_congestion"]

    green_time = calculate_green_time(
                    vehicle_count, congestion, avg_speed, heavy_ratio)

    # Safe encode congestion
    known = list(le_cong.classes_)
    if congestion not in known:
        congestion = "Medium"
    cong_enc = le_cong.transform([congestion])[0]

    features = pd.DataFrame(
        [[vehicle_count, density, heavy_ratio,
          avg_speed, cong_enc]],
        columns=["vehicle_count", "density", "heavy_ratio",
                "avg_speed", "congestion_enc"]
    )

    pred     = model.predict(features)[0]
    priority = le_pri.inverse_transform([pred])[0]
    proba    = model.predict_proba(features)[0]
    conf     = {cls: round(p*100, 1)
                for cls, p in zip(le_pri.classes_, proba)}

    print(f"\n[PREDICT] count:{vehicle_count} | density:{density} | "
          f"speed:{avg_speed} | {congestion}")
    print(f"          Green time → {green_time}s")
    print(f"          Priority   → {priority}")
    print(f"          Confidence → {conf}")

    return congestion, green_time, priority


# ── MAIN ──────────────────────────────────────────────────

def run_module4():
    print("=" * 60)
    print("  MODULE 4 — Rule-Based Timing + RF Lane Priority")
    print("=" * 60)

    print("\n[INFO] Loading YOLOv8 model...")
    model = YOLO("yolov8n.pt")
    print("[INFO] Model ready.\n")

    all_rows = []
    for lane_name, video_path in LANE_VIDEOS.items():
        if not os.path.exists(video_path):
            print(f"[WARNING] Skipping — not found: {video_path}")
            continue
        rows = extract_features(model, lane_name, video_path)
        all_rows.extend(rows)

    if not all_rows:
        print("[ERROR] No data extracted.")
        return

    rf_model, le_pri, le_cong = train_priority_model(all_rows)

    # Prediction tests
    print("\n" + "=" * 60)
    print("  PREDICTION TEST — Lane Status")
    print("=" * 60)
    predict_lane_status(33, 0.20, 0.3,  8.0, "High")    # Lane D scenario
    predict_lane_status(20, 0.14, 0.1, 18.0, "Medium")  # Lane A scenario
    predict_lane_status(3,  0.03, 0.0, 55.0, "Low")     # Lane C scenario

    print("\n[INFO] Module 4 complete. Model ready for Module 5.")


if __name__ == "__main__":
    run_module4()
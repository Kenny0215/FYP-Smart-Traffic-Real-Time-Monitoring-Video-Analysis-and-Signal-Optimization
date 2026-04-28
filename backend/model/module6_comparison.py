import os
import cv2
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

# ─────────────────────────────────────────────────────────
# MODULE 6 — Traditional vs AI Signal Timing Comparison
#
# Traditional : Fixed 60s green for every lane
# AI Adaptive : Webster formula (density-based)
#
# Efficiency = how close green time is to ideal demand
#              ideal = proportional to actual vehicle count
# ─────────────────────────────────────────────────────────

LANE_VIDEOS = {
    "Lane A": "traffic A.mp4",
    "Lane B": "traffic B.mp4",
    "Lane C": "traffic C.mp4",
    "Lane D": "traffic D.mp4"
}

OUTPUT_DIR           = "comparison_output"
CONFIDENCE_THRESHOLD = 0.4
VEHICLE_CLASSES      = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}
PIXELS_PER_METER     = 8.0
SPEED_SAMPLE_FRAMES  = 5

TRADITIONAL_GREEN = 60
TRADITIONAL_RED   = 60 * 3    # 3 other lanes wait while 1 lane is green
MIN_GREEN         = 10
MAX_GREEN         = 60
MAX_VEHICLES      = 45.0


# ── GREEN TIME FORMULA (same as Module 4) ─────────────────

def calculate_density(vehicle_count, frame_width, frame_height):
    road_area   = frame_width * frame_height * 0.67
    density_pct = (vehicle_count / max(road_area, 1)) * 10000
    return round(density_pct, 4)


def classify_congestion_by_count(vehicle_count):
    if vehicle_count >= 30:
        return "High"
    elif vehicle_count >= 20:
        return "Medium"
    else:
        return "Low"


def calculate_green_time(vehicle_count, congestion, avg_speed, heavy_ratio):
    if congestion == "High":
        base, per_vehicle = 40, 0.6
    elif congestion == "Medium":
        base, per_vehicle = 20, 0.8
    else:
        base, per_vehicle = 10, 0.5
    green_time   = base + (vehicle_count * per_vehicle)
    speed_factor = max(0, (40 - avg_speed) / 40)
    green_time  += speed_factor * 10
    green_time  += heavy_ratio * 8
    return round(max(MIN_GREEN, min(MAX_GREEN, green_time)), 1)


# ── EXTRACT FEATURES ──────────────────────────────────────

def extract_lane_features(yolo_model, lane_name, video_path):
    print(f"  [INFO] Extracting — {lane_name}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"  [ERROR] Cannot open: {video_path}")
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

        results     = yolo_model(frame, verbose=False)[0]
        detections  = []
        type_counts = {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0}

        for box in results.boxes:
            class_id   = int(box.cls[0])
            confidence = float(box.conf[0])
            if class_id not in VEHICLE_CLASSES or \
               confidence < CONFIDENCE_THRESHOLD:
                continue
            label = VEHICLE_CLASSES[class_id]
            type_counts[label] += 1
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            detections.append(([x1, y1, x2-x1, y2-y1], confidence, label))

        tracks       = tracker.update_tracks(detections, frame=frame)
        active_count = 0
        speed_list   = []

        for track in tracks:
            if not track.is_confirmed():
                continue
            active_count += 1
            track_id      = track.track_id
            x1, y1, x2, y2 = map(int, track.to_ltrb())
            cx, cy = (x1+x2)//2, (y1+y2)//2

            if track_id in id_positions:
                prev_cx, prev_cy, prev_frame = id_positions[track_id]
                frame_diff = frame_num - prev_frame
                if frame_diff >= SPEED_SAMPLE_FRAMES:
                    pixel_dist = ((cx-prev_cx)**2 + (cy-prev_cy)**2) ** 0.5
                    meters     = pixel_dist / PIXELS_PER_METER
                    seconds    = frame_diff / fps
                    speed_kmh  = (meters / seconds) * 3.6
                    id_speeds[track_id]    = round(speed_kmh, 1)
                    id_positions[track_id] = (cx, cy, frame_num)
            else:
                id_positions[track_id] = (cx, cy, frame_num)

            if track_id in id_speeds:
                speed_list.append(id_speeds[track_id])

        total_v     = max(active_count, 1)
        density_pct = calculate_density(active_count, width, height)
        congestion  = classify_congestion_by_count(active_count)
        heavy_count = type_counts["Bus"] + type_counts["Truck"]
        heavy_ratio = round(heavy_count / total_v, 3)
        avg_speed   = round(sum(speed_list) / max(len(speed_list), 1), 1)
        ai_green    = calculate_green_time(
                        active_count, congestion, avg_speed, heavy_ratio)

        rows.append({
            "lane":          lane_name,
            "frame":         frame_num,
            "vehicle_count": active_count,
            "density":       round(density_pct, 4),
            "congestion":    congestion,
            "avg_speed":     avg_speed,
            "heavy_ratio":   heavy_ratio,
            "ai_green":      ai_green,
            "trad_green":    TRADITIONAL_GREEN,
        })

        if frame_num % 200 == 0:
            pct = round(frame_num / total_frames * 100) if total_frames else "?"
            print(f"    {lane_name} — Frame {frame_num} ({pct}%) | "
                  f"Count:{active_count} | {congestion} | AI:{ai_green}s")

    cap.release()
    print(f"  ✅ {lane_name} — {len(rows)} frames extracted")
    return rows


# ── COMPUTE METRICS ───────────────────────────────────────

def compute_metrics(all_rows):
    df      = pd.DataFrame(all_rows)
    metrics = []

    for lane in df["lane"].unique():
        ld = df[df["lane"] == lane]

        avg_vehicles  = round(ld["vehicle_count"].mean(), 1)
        avg_density   = round(ld["density"].mean(), 4)
        avg_speed     = round(ld["avg_speed"].mean(), 1)
        dominant_cong = ld["congestion"].mode()[0]
        avg_ai_green  = round(ld["ai_green"].mean())

        # Ideal green proportional to vehicle count
        ideal_green = round(
            MIN_GREEN + (avg_vehicles / MAX_VEHICLES) *
            (MAX_GREEN - MIN_GREEN))
        ideal_green = max(MIN_GREEN, min(MAX_GREEN, ideal_green))

        # Efficiency = 100 - deviation penalty from ideal
        trad_deviation  = abs(TRADITIONAL_GREEN - ideal_green)
        ai_deviation    = abs(avg_ai_green - ideal_green)
        trad_efficiency = round(max(0, 100 - (trad_deviation / MAX_GREEN * 100)), 1)
        ai_efficiency   = round(max(0, 100 - (ai_deviation   / MAX_GREEN * 100)), 1)
        improvement     = round(ai_efficiency - trad_efficiency, 1)

        # Wait time — how long other lanes wait
        trad_wait = TRADITIONAL_RED
        ai_wait   = round((MAX_GREEN - avg_ai_green) * 3)
        trad_util = round((TRADITIONAL_GREEN / MAX_GREEN) * 100, 1)
        ai_util   = round((avg_ai_green / MAX_GREEN) * 100, 1)

        # Congestion distribution — frame counts
        high_frames   = int((ld["congestion"] == "High").sum())
        medium_frames = int((ld["congestion"] == "Medium").sum())
        low_frames    = int((ld["congestion"] == "Low").sum())

        metrics.append({
            "lane":             lane,
            "avg_vehicles":     avg_vehicles,
            "avg_density":      avg_density,
            "avg_speed_kmh":    avg_speed,
            "congestion":       dominant_cong,
            "ideal_green_time": ideal_green,
            "trad_green_time":  TRADITIONAL_GREEN,
            "ai_green_time":    avg_ai_green,
            "trad_wait_time":   trad_wait,
            "ai_wait_time":     ai_wait,
            "trad_utilization": trad_util,
            "ai_utilization":   ai_util,
            "trad_efficiency":  trad_efficiency,
            "ai_efficiency":    ai_efficiency,
            "improvement_%":    improvement,
            "high_frames":      high_frames,
            "medium_frames":    medium_frames,
            "low_frames":       low_frames,
        })

    return pd.DataFrame(metrics)


# ── SAVE COMPARISON TABLE ─────────────────────────────────

def save_comparison_table(metrics_df):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, "comparison_table.csv")
    metrics_df.to_csv(path, index=False)
    print(f"\n[INFO] Comparison table saved: {path}")

    print("\n" + "=" * 82)
    print(f"  {'Lane':<10} {'Vehicles':>9} {'Ideal':>7} "
          f"{'Trad':>7} {'AI':>7} {'Congestion':>12} {'Improvement':>13}")
    print("  " + "-" * 80)
    for _, row in metrics_df.iterrows():
        print(f"  {row['lane']:<10} {row['avg_vehicles']:>9} "
              f"{int(row['ideal_green_time']):>5}s "
              f"{int(row['trad_green_time']):>5}s "
              f"{int(row['ai_green_time']):>5}s "
              f"{row['congestion']:>12} "
              f"{row['improvement_%']:>+12.1f}%")
    print("=" * 82)


# ── BAR CHART (4 charts) ──────────────────────────────────

def save_bar_chart(metrics_df):
    lanes      = metrics_df["lane"].tolist()
    ideal      = metrics_df["ideal_green_time"].tolist()
    trad_green = metrics_df["trad_green_time"].tolist()
    ai_green   = metrics_df["ai_green_time"].tolist()
    trad_eff   = metrics_df["trad_efficiency"].tolist()
    ai_eff     = metrics_df["ai_efficiency"].tolist()
    trad_wait  = metrics_df["trad_wait_time"].tolist()
    ai_wait    = metrics_df["ai_wait_time"].tolist()
    high_f     = metrics_df["high_frames"].tolist()
    medium_f   = metrics_df["medium_frames"].tolist()
    low_f      = metrics_df["low_frames"].tolist()

    total_ai_green = sum(ai_green) 
    ai_wait = [total_ai_green - g for g in ai_green] 
    trad_wait = [TRADITIONAL_GREEN * 3] * len(lanes) 

    x     = np.arange(len(lanes))
    width = 0.28

    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    fig.suptitle(
        "Traditional vs AI Signal Timing Comparison",
        fontsize=14, fontweight="bold")

    # ── Chart 1: Green Time ───────────────────────────────
    ax1 = axes[0, 0]
    ax1.bar(x - width, trad_green, width,
            label=f"Traditional (Fixed {TRADITIONAL_GREEN}s)",
            color="#E74C3C", alpha=0.85)
    ax1.bar(x,         ai_green,   width,
            label="AI Adaptive",
            color="#2ECC71", alpha=0.85)
    ax1.bar(x + width, ideal,      width,
            label="Ideal (Vehicle-based)",
            color="#3498DB", alpha=0.85)

    ax1.set_title("Green Time per Lane (seconds)", fontsize=12)
    ax1.set_ylabel("Green Time (s)")
    ax1.set_xticks(x)
    ax1.set_xticklabels(lanes)
    ax1.set_ylim(0, 80)
    ax1.legend(fontsize=8)
    ax1.grid(axis="y", alpha=0.3)
    for container in ax1.containers:
        for bar in container:
            ax1.text(bar.get_x() + bar.get_width()/2,
                     bar.get_height() + 0.5,
                     f"{int(bar.get_height())}s",
                     ha="center", va="bottom", fontsize=8)

    # ── Chart 2: Efficiency ───────────────────────────────
    ax2 = axes[0, 1]
    bars3 = ax2.bar(x - width/2, trad_eff, width,
                    label="Traditional",
                    color="#E74C3C", alpha=0.85)
    bars4 = ax2.bar(x + width/2, ai_eff,   width,
                    label="AI Adaptive",
                    color="#2ECC71", alpha=0.85)
    ax2.set_title("Signal Efficiency per Lane (%)\n"
                  "(How well green time matches vehicle demand)",
                  fontsize=11)
    ax2.set_ylabel("Efficiency (%)")
    ax2.set_xticks(x)
    ax2.set_xticklabels(lanes)
    ax2.set_ylim(0, 115)
    ax2.legend(fontsize=9)
    ax2.grid(axis="y", alpha=0.3)
    for bar in bars3:
        ax2.text(bar.get_x() + bar.get_width()/2,
                 bar.get_height() + 1,
                 f"{bar.get_height():.1f}%",
                 ha="center", va="bottom", fontsize=9)
    for bar in bars4:
        ax2.text(bar.get_x() + bar.get_width()/2,
                 bar.get_height() + 1,
                 f"{bar.get_height():.1f}%",
                 ha="center", va="bottom", fontsize=9)

    # ── Chart 3: Wait Time ────────────────────────────────
    ax3 = axes[1, 0]
    bars5 = ax3.bar(x - width/2, trad_wait, width,
                    label="Traditional",
                    color="#E74C3C", alpha=0.85)
    bars6 = ax3.bar(x + width/2, ai_wait,   width,
                    label="AI Adaptive",
                    color="#2ECC71", alpha=0.85)
    ax3.set_title("Wait Time per Lane (seconds)\n"
                  "(Sum of green time given to other 3 lanes)",
                  fontsize=11)
    ax3.set_ylabel("Wait Time (s)")
    ax3.set_xticks(x)
    ax3.set_xticklabels(lanes)
    ax3.set_ylim(0, 220)
    ax3.legend(fontsize=9)
    ax3.grid(axis="y", alpha=0.3)
    for bar in bars5:
        ax3.text(bar.get_x() + bar.get_width()/2,
                 bar.get_height() + 1,
                 f"{int(bar.get_height())}s",
                 ha="center", va="bottom", fontsize=9)
    for bar in bars6:
        ax3.text(bar.get_x() + bar.get_width()/2,
                 bar.get_height() + 1,
                 f"{int(bar.get_height())}s",
                 ha="center", va="bottom", fontsize=9)

    # ── Chart 4: Congestion Distribution ─────────────────
    ax4 = axes[1, 1]
    ax4.bar(x, high_f,   width * 2,
            label="High",   color="#E74C3C", alpha=0.85)
    ax4.bar(x, medium_f, width * 2,
            label="Medium", color="#F39C12", alpha=0.85,
            bottom=high_f)
    ax4.bar(x, low_f,    width * 2,
            label="Low",    color="#2ECC71", alpha=0.85,
            bottom=[h + m for h, m in zip(high_f, medium_f)])
    ax4.set_title("Congestion Distribution per Lane\n"
                  "(Frame count per congestion level)",
                  fontsize=11)
    ax4.set_ylabel("Number of Frames")
    ax4.set_xticks(x)
    ax4.set_xticklabels(lanes)
    ax4.legend(fontsize=9)
    ax4.grid(axis="y", alpha=0.3)
    # Total label on top of each bar
    for i, (h, m, l) in enumerate(zip(high_f, medium_f, low_f)):
        total = h + m + l
        ax4.text(x[i], total + 1, f"{total}",
                 ha="center", va="bottom", fontsize=9,
                 fontweight="bold")

    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "bar_chart.png")
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"[INFO] Bar chart saved: {path}")


# ── PERFORMANCE METRICS ───────────────────────────────────

def save_performance_metrics(metrics_df):
    avg_trad_eff   = round(metrics_df["trad_efficiency"].mean(), 1)
    avg_ai_eff     = round(metrics_df["ai_efficiency"].mean(), 1)
    avg_trad_green = round(metrics_df["trad_green_time"].mean())
    avg_ai_green   = round(metrics_df["ai_green_time"].mean())
    total_trad     = int(metrics_df["trad_green_time"].sum())
    total_ai       = int(metrics_df["ai_green_time"].sum())
    time_saved     = total_trad - total_ai
    pct_saved      = round((time_saved / total_trad) * 100, 1)
    avg_improve    = round(metrics_df["improvement_%"].mean(), 1)
    avg_ai_wait    = round(metrics_df["ai_wait_time"].mean())
    total_ideal    = int(metrics_df["ideal_green_time"].sum())

    perf = pd.DataFrame([
        {
            "metric":      "Avg Green Time (s)",
            "traditional": avg_trad_green,
            "ai_adaptive": avg_ai_green,
            "difference":  round(avg_ai_green - avg_trad_green)
        },
        {
            "metric":      "Avg Efficiency (%)",
            "traditional": f"{avg_trad_eff}",
            "ai_adaptive": f"{avg_ai_eff}",
            "difference":  f"+{round(avg_ai_eff - avg_trad_eff, 1)}"
        },
        {
            "metric":      "Total Cycle Time (s)",
            "traditional": f"{total_trad}",
            "ai_adaptive": f"{total_ai}",
            "difference":  f"-{time_saved}"
        },
        {
            "metric":      "Avg Wait Time (s)",
            "traditional": f"{int(TRADITIONAL_RED)}",
            "ai_adaptive": f"{int(avg_ai_wait)}",
            "difference":  f"-{int(TRADITIONAL_RED - avg_ai_wait)}"
        },
        {
            "metric":      "Green Time Waste (s)",
            "traditional": f"{int(total_trad - total_ideal)}",
            "ai_adaptive": f"{int(total_ai  - total_ideal)}",
            "difference":  f"-{int((total_trad - total_ideal) - (total_ai - total_ideal))}"
        },
    ])

    path = os.path.join(OUTPUT_DIR, "performance_metrics.csv")
    perf.to_csv(path, index=False)
    print(f"[INFO] Performance metrics saved: {path}")

    print("\n" + "=" * 62)
    print("  OVERALL PERFORMANCE METRICS")
    print("=" * 62)
    print(f"  {'Metric':<28} {'Traditional':>12} "
          f"{'AI':>8} {'Diff':>10}")
    print("  " + "-" * 60)
    for _, row in perf.iterrows():
        print(f"  {row['metric']:<28} {str(row['traditional']):>12} "
              f"{str(row['ai_adaptive']):>8} "
              f"{str(row['difference']):>10}")
    print("=" * 62)

    return perf


# ── MAIN ──────────────────────────────────────────────────

def run_module6():
    print("=" * 60)
    print("  MODULE 6 — Traditional vs AI Comparison")
    print("=" * 60)
    print(f"\n  Traditional : Fixed {TRADITIONAL_GREEN}s per lane")
    print(f"  AI Adaptive : Webster formula (density-based)")
    print(f"  Efficiency  : vs ideal green per vehicle count")

    print("\n[INFO] Loading YOLOv8 model...")
    yolo_model = YOLO("yolov8n.pt")
    print("[INFO] YOLOv8 ready.\n")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Step 1 — Extract
    print("[STEP 1] Extracting lane features...")
    all_rows = []
    for lane_name, video_path in LANE_VIDEOS.items():
        if not os.path.exists(video_path):
            print(f"  [WARNING] Not found: {video_path}")
            continue
        rows = extract_lane_features(yolo_model, lane_name, video_path)
        all_rows.extend(rows)

    if not all_rows:
        print("[ERROR] No data extracted.")
        return

    # Step 2 — Metrics
    print("\n[STEP 2] Computing comparison metrics...")
    metrics_df = compute_metrics(all_rows)

    # Step 3 — Table
    print("\n[STEP 3] Saving comparison table...")
    save_comparison_table(metrics_df)

    # Step 4 — Chart
    print("\n[STEP 4] Generating bar charts...")
    save_bar_chart(metrics_df)

    # Step 5 — Performance
    print("\n[STEP 5] Computing performance metrics...")
    save_performance_metrics(metrics_df)

    print("\n" + "=" * 60)
    print("  MODULE 6 COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    run_module6()
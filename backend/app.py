import os
import sys
import cv2
import time
import joblib
import numpy as np
import pandas as pd
import threading
import queue
import base64
import enum
import urllib.request
from collections import defaultdict
from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
from supabase import create_client, Client
from datetime import datetime
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from functools import wraps

from fuzzy_controller import (
    FuzzyGreenTimeController,
    calculate_priority_score,
    coordinate_green_times,
    MIN_GREEN,
    MAX_GREEN,
    CYCLE_TIME,
)

GDRIVE_VIDEO_MAP = {
    "LaneA": {
        "lane_name": "Lane A",
        "file_name": "traffic 1.mp4",
        "file_id":   os.getenv("GDRIVE_LANE_A", "19KVhjrn9llwoBBdl8WXun6PqsJj9bz54"),
    },
    "LaneB": {
        "lane_name": "Lane B",
        "file_name": "traffic 2.mp4",
        "file_id":   os.getenv("GDRIVE_LANE_B", "1Y0mn1i2pfVh231WtxNt2i4SwuajeOuDL"),
    },
    "LaneC": {
        "lane_name": "Lane C",
        "file_name": "traffic 3.mp4",
        "file_id":   os.getenv("GDRIVE_LANE_C", "17fo2R1rnu1LWi91e4mlDULgfrSt8Ecec"),
    },
    "LaneD": {
        "lane_name": "Lane D",
        "file_name": "traffic 4.mp4",
        "file_id":   os.getenv("GDRIVE_LANE_D", "1vnJB0fTHxWkP1IWkEWroOKKZEgoMn-eU"),
    },
}

MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
sys.path.append(MODEL_DIR)

load_dotenv(".env.local")
SUPABASE_URL = os.getenv("PROJECT_URL")
SUPABASE_KEY = os.getenv("PUBLISHABLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)
CORS(app)

# ── Allow large video uploads up to 500 MB ────────────────
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

# ── Rate Limiter ──────────────────────────────────────────
class RateLimiter:
    def __init__(self):
        self._store = defaultdict(lambda: defaultdict(list))

    def is_allowed(self, ip: str, endpoint: str, limit: int, window: int) -> bool:
        now = time.time()
        key = self._store[ip][endpoint]
        self._store[ip][endpoint] = [t for t in key if now - t < window]
        if len(self._store[ip][endpoint]) >= limit:
            return False
        self._store[ip][endpoint].append(now)
        return True

    def remaining(self, ip: str, endpoint: str, limit: int, window: int) -> int:
        now = time.time()
        key = self._store[ip][endpoint]
        recent = [t for t in key if now - t < window]
        return max(0, limit - len(recent))

rate_limiter = RateLimiter()

def get_client_ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr).split(",")[0].strip()

def rate_limit(limit: int, window: int, per: str = "ip"):
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            ip       = get_client_ip()
            endpoint = request.endpoint or f.__name__
            if not rate_limiter.is_allowed(ip, endpoint, limit, window):
                resp = jsonify({
                    "error":       "Rate limit exceeded",
                    "message":     f"Too many requests. Max {limit} per {window}s.",
                    "retry_after": window,
                })
                resp.status_code = 429
                resp.headers["Retry-After"]           = str(window)
                resp.headers["X-RateLimit-Limit"]     = str(limit)
                resp.headers["X-RateLimit-Remaining"] = "0"
                return resp
            remaining = rate_limiter.remaining(ip, endpoint, limit, window)
            response  = f(*args, **kwargs)
            if hasattr(response, "headers"):
                response.headers["X-RateLimit-Limit"]     = str(limit)
                response.headers["X-RateLimit-Remaining"] = str(remaining)
            return response
        return wrapped
    return decorator

# ── FILE PATHS ─────────────────────────────────────────────
COMPARISON_TABLE_CSV = os.path.join(MODEL_DIR, "comparison_output", "comparison_table.csv")
PERFORMANCE_CSV      = os.path.join(MODEL_DIR, "comparison_output", "performance_metrics.csv")
EMERGENCY_LOG_CSV    = os.path.join(MODEL_DIR, "emergency_output",  "emergency_log.csv")
TRAINING_DATA_CSV    = os.path.join(MODEL_DIR, "model_output",      "training_data.csv")
CONGESTION_MODEL_PKL = os.path.join(MODEL_DIR, "model_output",      "congestion_model.pkl")
BAR_CHART_PNG        = os.path.join(MODEL_DIR, "comparison_output", "bar_chart.png")
YOLO_MODEL_PATH      = os.path.join(MODEL_DIR, "yolov8n.pt")
UPLOAD_FOLDER        = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {"mp4", "avi", "mov", "mkv"}

# ── DETECTION SETTINGS ────────────────────────────────────
CONFIDENCE_THRESHOLD = 0.4
VEHICLE_CLASSES      = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}
PIXELS_PER_METER     = 8.0
SPEED_SAMPLE_FRAMES  = 5
CONG_HIGH            = 25
CONG_MEDIUM          = 15
PROCESS_EVERY_N      = 2
QUEUE_MAX_SIZE       = 30

# ── SIGNAL CONTROLLER SETTINGS ────────────────────────────
ALL_RED_CLEARANCE = 2
YELLOW_DURATION   = 3

# ── COLORS ────────────────────────────────────────────────
COLORS = {
    "Car":        (0,   255, 0),
    "Motorcycle": (255, 165, 0),
    "Bus":        (0,   0,   255),
    "Truck":      (0,   165, 255),
}
CONG_COLORS = {
    "High":   (0,   0,   255),
    "Medium": (0,   165, 255),
    "Low":    (0,   255, 0),
}
SIGNAL_COLORS = {
    "green":  (0,   220, 80),
    "yellow": (0,   200, 255),
    "red":    (0,   0,   220),
}
VEHICLE_TYPE_COLORS_BGR = {
    "Car":        (0,   255, 0),
    "Motorcycle": (0,   165, 255),
    "Bus":        (255, 0,   0),
    "Truck":      (0,   165, 255),
}

# ── LANE CONFIG ────────────────────────────────────────────
LANE_CONFIG = {
    "LaneA": {"display": "Lane A", "video": os.path.join(MODEL_DIR, "traffic A.mp4")},
    "LaneB": {"display": "Lane B", "video": os.path.join(MODEL_DIR, "traffic B.mp4")},
    "LaneC": {"display": "Lane C", "video": os.path.join(MODEL_DIR, "traffic C.mp4")},
    "LaneD": {"display": "Lane D", "video": os.path.join(MODEL_DIR, "traffic D.mp4")},
}

# ── SHARED STATE ───────────────────────────────────────────
frame_queues = {lane: queue.Queue(maxsize=QUEUE_MAX_SIZE) for lane in LANE_CONFIG}

lane_stats = {lane: {
    "lane":              cfg["display"],
    "vehicle_count":     0,
    "congestion":        "Low",
    "green_time":        MIN_GREEN,
    "coordinated_green": MIN_GREEN,
    "priority":          "Low",
    "priority_score":    0.0,
    "avg_speed":         0.0,
    "density":           0.0,
    "heavy_ratio":       0.0,
    "frame":             0,
    "fps":               0.0,
    "vehicle_types":     {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0},
    "signal_state":      "red",
} for lane, cfg in LANE_CONFIG.items()}

stats_lock = threading.Lock()
yolo_lock  = threading.Lock()

active_videos = {lane: cfg["video"] for lane, cfg in LANE_CONFIG.items()}
stop_flags    = {lane: False for lane in LANE_CONFIG}

live_emergency_log = []
emergency_lock     = threading.Lock()

# Temp files downloaded from external URLs — cleaned up on stop
_temp_video_files: dict = {}
_temp_lock = threading.Lock()

# ── LOAD MODELS ────────────────────────────────────────────
print("[INFO] Loading YOLO model...")
yolo_model = YOLO(YOLO_MODEL_PATH)
print("[INFO] YOLO ready.")

fuzzy_ctrl = FuzzyGreenTimeController()
print(f"[INFO] Fuzzy controller ready: {fuzzy_ctrl.is_ready()}")

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


# ── HELPER FUNCTIONS ───────────────────────────────────────

def allowed_file(filename):
    return "." in filename and \
           filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


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


def _remove_file(path: str):
    """Safely remove a file, ignoring errors."""
    try:
        if path and os.path.exists(path):
            os.remove(path)
            print(f"[CLEANUP] Removed: {path}")
    except Exception as e:
        print(f"[WARN] Could not remove {path}: {e}")


def _gdrive_file_id_to_download_url(file_id: str) -> str:
    """Convert a Google Drive file ID to a direct download URL."""
    return f"https://drive.google.com/uc?export=download&id={file_id}"


def _gdrive_file_id_to_view_url(file_id: str) -> str:
    """Convert a Google Drive file ID to a view URL."""
    return f"https://drive.google.com/file/d/{file_id}/view"

def _download_video_url(video_url: str, lane_key: str) -> str | None:
    """
    Download a video from a direct URL to a local temp file.
    Handles Google Drive large-file confirmation redirects.
    """
    try:
        filename   = f"temp_{lane_key}_{int(time.time())}.mp4"
        local_path = os.path.join(UPLOAD_FOLDER, filename)

        print(f"[URL] Downloading {lane_key} → {local_path}")

        req = urllib.request.Request(
            video_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                              "AppleWebKit/537.36 Chrome/120 Safari/537.36",
                "Accept": "*/*",
            }
        )

        with urllib.request.urlopen(req, timeout=300) as response:
            content_type = response.headers.get("Content-Type", "")
            if "text/html" in content_type:
                # Google Drive large-file virus warning page
                # Extract confirm token and retry
                html = response.read(4096).decode("utf-8", errors="ignore")
                confirm = None
                if "confirm=" in html:
                    try:
                        confirm = html.split("confirm=")[1].split("&")[0].split('"')[0]
                    except Exception:
                        pass
                if confirm:
                    confirm_url = f"{video_url}&confirm={confirm}"
                    req2 = urllib.request.Request(
                        confirm_url,
                        headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"}
                    )
                    response = urllib.request.urlopen(req2, timeout=300)

            with open(local_path, "wb") as out:
                while True:
                    chunk = response.read(8 * 1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)

        size_mb = os.path.getsize(local_path) / (1024 * 1024)

        if size_mb < 0.1:
            print(f"[ERROR] File too small ({size_mb:.2f} MB) — likely an error page")
            print("[ERROR] Make sure Drive file is shared: 'Anyone with the link'")
            _remove_file(local_path)
            return None

        print(f"[URL] Download complete: {size_mb:.1f} MB")
        return local_path

    except Exception as e:
        print(f"[ERROR] Download failed for {lane_key}: {e}")
        return None

def _convert_gdrive_url(url: str) -> str:
    """
    Convert any Google Drive share URL to a direct download URL.
    Handles all common Drive URL formats.
    """
    if "drive.google.com/uc?export=download" in url:
        return url   # already converted

    if "drive.google.com/file/d/" in url:
        try:
            file_id = url.split("/file/d/")[1].split("/")[0].split("?")[0]
            return _gdrive_file_id_to_download_url(file_id)
        except Exception:
            pass

    if "drive.google.com" in url and "id=" in url:
        try:
            file_id = url.split("id=")[1].split("&")[0].split("?")[0]
            return _gdrive_file_id_to_download_url(file_id)
        except Exception:
            pass

    return url


# ── SIGNAL PHASE CONTROLLER ────────────────────────────────

class Phase(enum.Enum):
    GREEN  = "green"
    YELLOW = "yellow"
    RED    = "red"


class SignalController:
    def __init__(self, lane_order=None):
        self.lane_order       = lane_order or list(LANE_CONFIG.keys())
        self.current_idx      = 0
        self._state           = {lane: Phase.RED for lane in self.lane_order}
        self._phase_end       = 0.0
        self._all_red_end     = 0.0
        self._stage           = "all_red"
        self._lock            = threading.Lock()
        self._override_lane   = None
        self.remaining_green  = 0.0
        self.current_lane_key = None

    def get_state(self):
        with self._lock:
            return {k: v.value for k, v in self._state.items()}

    def get_detail(self):
        with self._lock:
            return {
                "active_lane":       self.current_lane_key,
                "stage":             self._stage,
                "remaining":         round(max(0.0, self._phase_end - time.time()), 1),
                "states":            {k: v.value for k, v in self._state.items()},
                "lane_order":        self.lane_order,
                "all_red_clearance": ALL_RED_CLEARANCE,
                "yellow_duration":   YELLOW_DURATION,
            }

    def emergency_override(self, lane_key: str):
        if lane_key not in self.lane_order:
            return
        with self._lock:
            self._override_lane = lane_key
            self._phase_end     = time.time()
        print(f"[SIGNAL] Emergency override → {lane_key}")

    def update_lane_order(self, new_order: list):
        with self._lock:
            valid = [k for k in new_order if k in LANE_CONFIG]
            if valid:
                self.lane_order  = valid
                self.current_idx = 0

    def run(self):
        print("[SIGNAL] Controller started. Sequence:", self.lane_order)
        with self._lock:
            self._stage       = "all_red"
            self._all_red_end = time.time() + ALL_RED_CLEARANCE

        while True:
            now = time.time()
            with self._lock:
                stage         = self._stage
                phase_end     = self._phase_end
                all_red_end   = self._all_red_end
                override_lane = self._override_lane

            if override_lane and stage != "all_red":
                with self._lock:
                    for lane in self.lane_order:
                        self._state[lane] = Phase.RED
                    self._stage       = "all_red"
                    self._all_red_end = now + ALL_RED_CLEARANCE
                self._sync_lane_stats()
                time.sleep(0.05)
                continue

            if stage == "all_red":
                if now >= all_red_end:
                    with self._lock:
                        if self._override_lane:
                            target_lane = self._override_lane
                            if target_lane in self.lane_order:
                                self.current_idx = self.lane_order.index(target_lane)
                            self._override_lane = None
                            green_secs = MAX_GREEN
                        else:
                            target_lane = self.lane_order[self.current_idx]
                            green_secs  = self._read_coordinated_green(target_lane)

                        self.current_lane_key = target_lane
                        self._stage           = "green"
                        self._phase_end       = now + green_secs
                        self.remaining_green  = green_secs

                        for lane in self.lane_order:
                            self._state[lane] = (
                                Phase.GREEN if lane == target_lane else Phase.RED
                            )

                    self._sync_lane_stats()
                    print(f"[SIGNAL] → {target_lane} GREEN for {green_secs}s")

            elif stage == "green":
                self.remaining_green = max(0.0, phase_end - now)
                if now >= phase_end:
                    if YELLOW_DURATION > 0:
                        with self._lock:
                            active              = self.lane_order[self.current_idx]
                            self._state[active] = Phase.YELLOW
                            self._stage         = "yellow"
                            self._phase_end     = now + YELLOW_DURATION
                        self._sync_lane_stats()
                        print(f"[SIGNAL] → {active} YELLOW for {YELLOW_DURATION}s")
                    else:
                        self._enter_all_red(now)

            elif stage == "yellow":
                if now >= phase_end:
                    self._enter_all_red(now)

            time.sleep(0.05)

    def _enter_all_red(self, now):
        with self._lock:
            for lane in self.lane_order:
                self._state[lane] = Phase.RED
            self._stage           = "all_red"
            self._all_red_end     = now + ALL_RED_CLEARANCE
            self.current_idx      = (self.current_idx + 1) % len(self.lane_order)
            self.current_lane_key = None
            self.remaining_green  = 0.0
        self._sync_lane_stats()
        print(f"[SIGNAL] All-RED clearance ({ALL_RED_CLEARANCE}s)")

    def _read_coordinated_green(self, lane_key: str) -> int:
        with stats_lock:
            return int(lane_stats[lane_key].get("coordinated_green", MIN_GREEN))

    def _sync_lane_stats(self):
        with self._lock:
            snapshot = {k: v.value for k, v in self._state.items()}
        with stats_lock:
            for lane_key, phase_str in snapshot.items():
                if lane_key in lane_stats:
                    lane_stats[lane_key]["signal_state"] = phase_str


signal_controller = SignalController()


# ── OVERLAY ────────────────────────────────────────────────

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

    cv2.putText(frame,
                f"Priority: {stats['priority']}",
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


# ── AUTO-SAVE TO SUPABASE ──────────────────────────────────

def auto_save_to_supabase():
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
                        "timestamp":             datetime.now().isoformat(),
                    })

            if rows:
                supabase.table("lane_status").insert(rows).execute()
                print(f"[AUTO-SAVE] Saved {len(rows)} lane rows to Supabase.")

        except Exception as e:
            print(f"[AUTO-SAVE] Error: {e}")


# ── BACKGROUND PROCESSING THREAD ──────────────────────────

def process_lane(lane_key, video_path, display_name):
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

        width       = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height      = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        video_fps   = int(cap.get(cv2.CAP_PROP_FPS)) or 25
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

                green_time = fuzzy_ctrl.calculate(active, avg_speed, heavy_ratio, congestion)
                priority   = predict_priority(active, density, heavy_ratio, avg_speed, congestion)
                p_score    = calculate_priority_score(active, density, heavy_ratio, avg_speed, congestion)

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


def start_all_threads():
    for lane_key, cfg in LANE_CONFIG.items():
        video_path   = active_videos[lane_key]
        display_name = cfg["display"]
        if not os.path.exists(video_path):
            print(f"[WARN] Video not found: {video_path} — skipping {lane_key}")
            continue
        threading.Thread(
            target=process_lane,
            args=(lane_key, video_path, display_name),
            daemon=True
        ).start()
        print(f"[INFO] Thread started — {display_name}")

    threading.Thread(target=signal_controller.run, daemon=True).start()
    print("[INFO] Signal controller thread started.")

    threading.Thread(target=auto_save_to_supabase, daemon=True).start()
    print("[INFO] Auto-save thread started.")


# ── MJPEG GENERATOR ────────────────────────────────────────

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


# ── API ENDPOINTS ──────────────────────────────────────────

@app.errorhandler(413)
def file_too_large(e):
    return jsonify({"error": "File too large. Maximum allowed is 500 MB.", "max_mb": 500}), 413


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "message":     "Traffic Management FYP API v5.0",
        "fuzzy_module": "fuzzy_controller.py",
        "fuzzy_ready":  fuzzy_ctrl.is_ready(),
        "streaming":    {k: f"/api/stream-local/{k}" for k in LANE_CONFIG},
        "endpoints": [
            "GET    /api/health",
            "GET    /api/live-stats",
            "GET    /api/live-stats/<lane_key>",
            "GET    /api/coordination",
            "GET    /api/signal-state",
            "GET    /api/signal-config",
            "POST   /api/signal-config",
            "GET    /api/vehicle-type-summary",
            "GET    /api/videos",
            "POST   /api/upload-video",
            "POST   /api/save-video-url",
            "DELETE /api/delete-video/<id>",
            "GET    /api/lanes",
            "GET    /api/comparison",
            "GET    /api/performance",
            "GET    /api/model-metrics",
            "GET    /api/emergency",
            "GET    /api/emergency-history",
            "GET    /api/chart",
            "GET    /api/stream-local/<lane_key>",
            "GET    /api/snapshot/<lane_key>",
            "POST   /api/start-analysis",
            "POST   /api/stop-analysis",
            "POST   /api/save-lanes-csv",
            "POST   /api/save-comparison",
            "POST   /api/save-emergency",
        ]
    })


@app.route("/api/health", methods=["GET"])
@rate_limit(limit=30, window=60)
def health():
    sig = signal_controller.get_detail()
    return jsonify({
        "status":        "ok",
        "yolo":          "loaded",
        "rf_model":      "loaded" if rf_model else "not found",
        "fuzzy_ready":   fuzzy_ctrl.is_ready(),
        "streams":       {k: not frame_queues[k].empty() for k in LANE_CONFIG},
        "signal_active": sig["active_lane"],
        "signal_stage":  sig["stage"],
        "timestamp":     datetime.now().isoformat(),
    })


@app.route("/api/stream-local/<lane_key>")
@rate_limit(limit=10, window=60)
def stream_local(lane_key):
    if lane_key not in LANE_CONFIG:
        return jsonify({"error": f"Unknown lane: {lane_key}"}), 404
    return Response(
        stream_with_context(mjpeg_generator(lane_key)),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@app.route("/api/snapshot/<lane_key>")
@rate_limit(limit=20, window=60)
def snapshot(lane_key):
    if lane_key not in LANE_CONFIG:
        return jsonify({"error": f"Unknown lane: {lane_key}"}), 404
    q          = frame_queues.get(lane_key)
    jpeg_bytes = None
    if q and not q.empty():
        try:
            jpeg_bytes = q.get_nowait()
            try:   q.put_nowait(jpeg_bytes)
            except queue.Full: pass
        except queue.Empty:
            pass
    if jpeg_bytes is None:
        with stats_lock:
            stats = dict(lane_stats.get(lane_key, {}))
        blank = np.zeros((240, 320, 3), dtype=np.uint8)
        cv2.putText(blank, stats.get("lane", lane_key),
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 212, 170), 2)
        cv2.putText(blank, f"Vehicles: {stats.get('vehicle_count', 0)}",
                    (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.putText(blank, f"Signal: {stats.get('signal_state','red').upper()}",
                    (10, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        _, buf = cv2.imencode(".jpg", blank)
        jpeg_bytes = buf.tobytes()
    return Response(jpeg_bytes, mimetype="image/jpeg",
                    headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"})


@app.route("/api/live-stats", methods=["GET"])
@rate_limit(limit=60, window=60)
def live_stats():
    with stats_lock:
        raw = {k: dict(v) for k, v in lane_stats.items()}
    sig_states = signal_controller.get_state()
    data = []
    for lane_key, stats in raw.items():
        row = dict(stats)
        row["ai_green_time"]  = stats["green_time"]
        row["lane_key"]       = lane_key
        row["signal_state"]   = sig_states.get(lane_key, "red")
        vt = row.get("vehicle_types", {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0})
        row["vehicle_types"]         = vt
        row["dominant_vehicle_type"] = max(vt, key=vt.get) if any(vt.values()) else "None"
        row.setdefault("coordinated_green", row["green_time"])
        row.setdefault("priority_score", 0.0)
        data.append(row)
    return jsonify({"data": data})


@app.route("/api/live-stats/<lane_key>", methods=["GET"])
@rate_limit(limit=60, window=60)
def live_stats_lane(lane_key):
    if lane_key not in lane_stats:
        return jsonify({"error": "Unknown lane"}), 404
    with stats_lock:
        data = dict(lane_stats[lane_key])
    data["ai_green_time"] = data["green_time"]
    data["signal_state"]  = signal_controller.get_state().get(lane_key, "red")
    vt = data.get("vehicle_types", {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0})
    data["dominant_vehicle_type"] = max(vt, key=vt.get) if any(vt.values()) else "None"
    data.setdefault("coordinated_green", data["green_time"])
    return jsonify({"data": data})


@app.route("/api/coordination", methods=["GET"])
@rate_limit(limit=30, window=60)
def get_coordination():
    with stats_lock:
        snapshot = {k: dict(v) for k, v in lane_stats.items()}
    coordinated, scores = coordinate_green_times(snapshot)
    total_score = sum(scores.values())
    sig         = signal_controller.get_detail()
    lanes_out   = {
        lane_key: {
            "lane":              stats["lane"],
            "priority_score":    scores.get(lane_key, 0.0),
            "fuzzy_green":       stats.get("green_time", MIN_GREEN),
            "coordinated_green": coordinated.get(lane_key, MIN_GREEN),
            "congestion":        stats["congestion"],
            "vehicle_count":     stats["vehicle_count"],
            "avg_speed":         stats["avg_speed"],
            "heavy_ratio":       stats["heavy_ratio"],
            "signal_state":      sig["states"].get(lane_key, "red"),
        }
        for lane_key, stats in snapshot.items()
    }
    return jsonify({
        "cycle_time":   CYCLE_TIME,
        "lanes":        lanes_out,
        "total_score":  round(total_score, 2),
        "active_lane":  sig["active_lane"],
        "signal_stage": sig["stage"],
        "remaining":    sig["remaining"],
        "timestamp":    datetime.now().isoformat(),
    })


@app.route("/api/signal-state", methods=["GET"])
@rate_limit(limit=120, window=60)
def get_signal_state():
    detail = signal_controller.get_detail()
    detail["timestamp"] = datetime.now().isoformat()
    return jsonify(detail)


@app.route("/api/signal-config", methods=["GET", "POST"])
@rate_limit(limit=20, window=60)
def signal_config():
    global ALL_RED_CLEARANCE, YELLOW_DURATION
    if request.method == "GET":
        return jsonify({
            "lane_order":        signal_controller.lane_order,
            "all_red_clearance": ALL_RED_CLEARANCE,
            "yellow_duration":   YELLOW_DURATION,
            "min_green":         MIN_GREEN,
            "max_green":         MAX_GREEN,
            "cycle_time":        CYCLE_TIME,
        })
    data    = request.get_json(silent=True) or {}
    updated = []
    if "lane_order" in data:
        signal_controller.update_lane_order(data["lane_order"])
        updated.append("lane_order")
    if "all_red_clearance" in data:
        val = int(data["all_red_clearance"])
        if 1 <= val <= 10:
            ALL_RED_CLEARANCE = val
            updated.append("all_red_clearance")
    if "yellow_duration" in data:
        val = int(data["yellow_duration"])
        if 0 <= val <= 10:
            YELLOW_DURATION = val
            updated.append("yellow_duration")
    return jsonify({
        "message":           f"Updated: {', '.join(updated) or 'nothing'}",
        "lane_order":        signal_controller.lane_order,
        "all_red_clearance": ALL_RED_CLEARANCE,
        "yellow_duration":   YELLOW_DURATION,
    })


@app.route("/api/vehicle-type-summary", methods=["GET"])
@rate_limit(limit=60, window=60)
def vehicle_type_summary():
    with stats_lock:
        raw = {k: dict(v) for k, v in lane_stats.items()}
    totals  = {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0}
    by_lane = {}
    for lane_key, stats in raw.items():
        vt = stats.get("vehicle_types", {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0})
        by_lane[stats["lane"]] = dict(vt)
        for vtype, count in vt.items():
            totals[vtype] = totals.get(vtype, 0) + count
    dominant = max(totals, key=totals.get) if any(totals.values()) else "None"
    return jsonify({"totals": totals, "by_lane": by_lane, "dominant": dominant})


# ── VIDEO MANAGEMENT ENDPOINTS ────────────────────────────

@app.route("/api/videos", methods=["GET"])
@rate_limit(limit=30, window=60)
def get_videos():
    """
    List all saved videos from Supabase.
    Returns both locally uploaded files and URL-linked videos.
    """
    try:
        response = supabase.table("video") \
                           .select("*") \
                           .order("upload_date", desc=True) \
                           .execute()
        return jsonify({"data": response.data or []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@app.route("/api/register-drive-videos", methods=["POST"])
@rate_limit(limit=5, window=60)
def register_drive_videos():
    """
    One-time setup: saves all 4 Drive video URLs into Supabase.
    Call this once — your video_url column will no longer be NULL.
    No body needed.
    """
    registered = []
    errors     = []

    for lane_key, info in GDRIVE_VIDEO_MAP.items():
        file_id      = info["file_id"]
        download_url = _gdrive_file_id_to_download_url(file_id)
        view_url     = _gdrive_file_id_to_view_url(file_id)

        try:
            # Check if already registered for this lane
            existing = supabase.table("video") \
                               .select("id") \
                               .eq("lane_name", info["lane_name"]) \
                               .not_.is_("video_url", "null") \
                               .execute()

            if existing.data:
                supabase.table("video") \
                        .update({
                            "video_url":   download_url,
                            "view_url":    view_url,
                            "file_name":   info["file_name"],
                            "upload_date": datetime.now().isoformat(),
                        }) \
                        .eq("id", existing.data[0]["id"]) \
                        .execute()
                action = "updated"
            else:
                supabase.table("video").insert({
                    "lane_name":   info["lane_name"],
                    "file_name":   info["file_name"],
                    "file_size":   None,
                    "format":      "mp4",
                    "video_url":   download_url,
                    "view_url":    view_url,
                    "upload_date": datetime.now().isoformat(),
                }).execute()
                action = "inserted"

            registered.append({
                "lane_key":  lane_key,
                "lane_name": info["lane_name"],
                "video_url": download_url,
                "view_url":  view_url,
                "action":    action,
            })
            print(f"[GDRIVE] {action} {info['lane_name']}: {download_url}")

        except Exception as e:
            errors.append({"lane_key": lane_key, "error": str(e)})

    return jsonify({
        "message":    f"Registered {len(registered)} Drive video(s)",
        "registered": registered,
        "errors":     errors,
        "next_step":  "Use video_url values in POST /api/start-analysis",
    })


@app.route("/api/upload-video", methods=["POST"])
@rate_limit(limit=10, window=60)
def upload_video():
    """
    Upload a video file directly (saves to local uploads/ folder).
    Metadata saved to Supabase video table.

    Form fields:
      video     : the video file
      lane_name : e.g. "Lane A"
    """
    if "video" not in request.files:
        return jsonify({"error": "No video file in request"}), 400

    file      = request.files["video"]
    lane_name = request.form.get("lane_name", "Lane A")

    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type. Allowed: mp4, avi, mov, mkv"}), 400

    filename  = secure_filename(file.filename)
    save_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)
    file_size_mb = round(os.path.getsize(save_path) / (1024 * 1024), 2)

    try:
        supabase.table("video").insert({
            "lane_name":   lane_name,
            "file_name":   filename,
            "file_size":   file_size_mb,
            "format":      filename.rsplit(".", 1)[-1].lower(),
            "video_url":   None,           # local file — no URL
            "upload_date": datetime.now().isoformat(),
        }).execute()
    except Exception as e:
        print(f"[WARN] Supabase video save failed: {e}")

    return jsonify({
        "message":   "Uploaded successfully",
        "filename":  filename,
        "size_mb":   file_size_mb,
        "lane_name": lane_name,
        "type":      "local",
    })


@app.route("/api/save-video-url", methods=["POST"])
@rate_limit(limit=20, window=60)
def save_video_url():
    """
    Save an external video URL to Supabase (Google Drive, OneDrive, Dropbox, etc.).
    No file is uploaded — just the URL is stored.

    Body:
    {
      "lane_name" : "Lane A",
      "video_url" : "https://drive.google.com/file/d/19KVhjrn9llwoBBdl8WXun6PqsJj9bz54/view?usp=drive_link",
      "file_name" : "traffic_1.mp4"   

      "lane_name" : "Lane B",
      "video_url" : "https://drive.google.com/file/d/1Y0mn1i2pfVh231WtxNt2i4SwuajeOuDL/view?usp=drive_link",
      "file_name" : "traffic_2.mp4"  

      "lane_name" : "Lane C",
      "video_url" : "https://drive.google.com/file/d/17fo2R1rnu1LWi91e4mlDULgfrSt8Ecec/view?usp=drive_link",
      "file_name" : "traffic_3.mp4"   

      "lane_name" : "Lane D",
      "video_url" : "https://drive.google.com/file/d/1vnJB0fTHxWkP1IWkEWroOKKZEgoMn-eU/view?usp=drive_link",
      "file_name" : "traffic_4.mp4"   
      
    }

    Google Drive setup:
      1. Upload your video to Google Drive
      2. Right-click → Share → Anyone with the link → Copy link
      3. Paste that link here — it will be auto-converted to direct download
    """
    data      = request.get_json(silent=True) or {}
    lane_name = data.get("lane_name", "Lane A")
    video_url = data.get("video_url", "").strip()
    file_name = data.get("file_name", "") or video_url.split("/")[-1].split("?")[0] or "video.mp4"

    if not video_url:
        return jsonify({"error": "video_url is required"}), 400

    # Auto-convert Google Drive share URL → direct download URL
    converted_url = _convert_gdrive_url(video_url)
    was_converted = converted_url != video_url

    try:
        supabase.table("video").insert({
            "lane_name":   lane_name,
            "file_name":   file_name,
            "file_size":   None,          # unknown until download
            "format":      file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "mp4",
            "video_url":   converted_url,
            "upload_date": datetime.now().isoformat(),
        }).execute()
    except Exception as e:
        return jsonify({"error": f"Supabase save failed: {str(e)}"}), 500

    return jsonify({
        "message":       "Video URL saved",
        "lane_name":     lane_name,
        "file_name":     file_name,
        "video_url":     converted_url,
        "was_converted": was_converted,
        "type":          "url",
        "note":          "Use this video_url in /api/start-analysis to begin processing",
    })


@app.route("/api/delete-video/<int:video_id>", methods=["DELETE"])
@rate_limit(limit=10, window=60)
def delete_video(video_id):
    """
    Delete a video record from Supabase by its ID.
    If it was a local upload, also deletes the file from disk.
    """
    try:
        # Fetch the record first to get filename
        resp = supabase.table("video").select("*").eq("id", video_id).execute()
        if not resp.data:
            return jsonify({"error": "Video not found"}), 404

        record    = resp.data[0]
        file_name = record.get("file_name")
        video_url = record.get("video_url")

        # Delete local file if it was a local upload (no URL)
        if not video_url and file_name:
            local_path = os.path.join(UPLOAD_FOLDER, file_name)
            _remove_file(local_path)

        # Delete from Supabase
        supabase.table("video").delete().eq("id", video_id).execute()

        return jsonify({"message": "Deleted", "id": video_id})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/start-analysis", methods=["POST"])
@rate_limit(limit=5, window=60)
def start_analysis():
   
    data  = request.get_json()
    lanes = data.get("lanes", {})
    if not lanes:
        return jsonify({"error": "No lanes provided"}), 400

    for lane_key in lanes:
        if lane_key in stop_flags:
            stop_flags[lane_key] = True
    time.sleep(0.8)

    started, errors = [], []

    for lane_key, video_source in lanes.items():
        if lane_key not in LANE_CONFIG:
            errors.append(f"Unknown lane: {lane_key}"); continue

        if isinstance(video_source, str) and video_source.startswith("http"):
            # External URL — auto-convert Google Drive share links
            download_url = _convert_gdrive_url(video_source)
            video_path   = _download_video_url(download_url, lane_key)
            if not video_path:
                errors.append(f"Failed to download video for {lane_key}"); continue
            with _temp_lock:
                _temp_video_files[lane_key] = video_path
        else:
            # Local filename
            video_path = os.path.join(UPLOAD_FOLDER, video_source)
            if not os.path.exists(video_path):
                errors.append(f"File not found: {video_source}"); continue

        active_videos[lane_key] = video_path

        q = frame_queues[lane_key]
        while not q.empty():
            try:   q.get_nowait()
            except queue.Empty: break

        stop_flags[lane_key] = False
        threading.Thread(
            target=process_lane,
            args=(lane_key, video_path, LANE_CONFIG[lane_key]["display"]),
            daemon=True
        ).start()
        started.append(lane_key)
        print(f"[INFO] Analysis started — {lane_key}")

    return jsonify({
        "message": f"Analysis started for {len(started)} lane(s)",
        "started": started,
        "errors":  errors,
    })


@app.route("/api/stop-analysis", methods=["POST"])
@rate_limit(limit=5, window=60)
def stop_analysis():
    data        = request.get_json(silent=True) or {}
    target_keys = data.get("lanes", list(LANE_CONFIG.keys()))
    stopped     = []

    for lane_key in target_keys:
        if lane_key not in LANE_CONFIG: continue
        stop_flags[lane_key] = True

        q = frame_queues[lane_key]
        while not q.empty():
            try:   q.get_nowait()
            except queue.Empty: break

        # Clean up temp downloaded video if any
        with _temp_lock:
            temp_path = _temp_video_files.pop(lane_key, None)
        if temp_path:
            threading.Thread(target=_remove_file, args=(temp_path,), daemon=True).start()

        with stats_lock:
            lane_stats[lane_key].update({
                "vehicle_count": 0, "congestion": "Low",
                "green_time": MIN_GREEN, "coordinated_green": MIN_GREEN,
                "priority": "Low", "priority_score": 0.0,
                "avg_speed": 0.0, "density": 0.0, "heavy_ratio": 0.0,
                "frame": 0, "fps": 0.0, "signal_state": "red",
                "vehicle_types": {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0},
            })
        stopped.append(lane_key)

    with emergency_lock:
        live_emergency_log.clear()

    return jsonify({"message": f"Stopped {len(stopped)} lane(s)", "stopped": stopped})


@app.route("/api/lanes", methods=["GET"])
@rate_limit(limit=20, window=60)
def get_lanes():
    try:
        response = supabase.table("lane_status") \
                           .select("*").order("timestamp", desc=True).limit(4).execute()
        if response.data:
            return jsonify({"source": "supabase", "data": response.data})
        if os.path.exists(TRAINING_DATA_CSV):
            df = pd.read_csv(TRAINING_DATA_CSV)
            return jsonify({"source": "csv",
                            "data": df.groupby("lane").last().reset_index()
                                      .to_dict(orient="records")})
        return jsonify({"error": "No data"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/comparison", methods=["GET"])
@rate_limit(limit=10, window=60)
def get_comparison():
    RENAME = {
        "ideal_green_time": "ideal_green",   "trad_green_time": "traditional_green",
        "ai_green_time":    "ai_green",      "trad_wait_time":  "traditional_wait",
        "ai_wait_time":     "ai_wait",       "trad_efficiency": "traditional_efficiency",
        "improvement_%":    "improvement",   "avg_speed_kmh":   "avg_speed",
    }
    try:
        if os.path.exists(COMPARISON_TABLE_CSV):
            df = pd.read_csv(COMPARISON_TABLE_CSV)
            df.rename(columns=RENAME, inplace=True)
            for col in ["avg_vehicles","traditional_green","ai_green","ideal_green",
                        "traditional_wait","ai_wait","avg_speed",
                        "traditional_efficiency","ai_efficiency","improvement"]:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce").round(1)
            return jsonify({"source": "csv", "data": df.to_dict(orient="records")})
        response = supabase.table("comparison_results") \
                           .select("*").order("lane", desc=False).limit(4).execute()
        if response.data:
            return jsonify({"source": "supabase", "data": response.data})
        return jsonify({"error": "No comparison data found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/performance", methods=["GET"])
@rate_limit(limit=10, window=60)
def get_performance():
    try:
        if os.path.exists(PERFORMANCE_CSV):
            return jsonify({"source": "csv",
                            "data": pd.read_csv(PERFORMANCE_CSV).to_dict(orient="records")})
        return jsonify({"error": "performance_metrics.csv not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/model-metrics", methods=["GET"])
def get_model_metrics():
    try:
        if os.path.exists(TRAINING_DATA_CSV) and rf_model is not None:
            try:
                df = pd.read_csv(TRAINING_DATA_CSV)
                feature_cols = ["vehicle_count","density","heavy_ratio",
                                "avg_speed","congestion_enc"]
                target_col   = "priority_level"
                if all(c in df.columns for c in feature_cols + [target_col]):
                    from sklearn.metrics import (accuracy_score, precision_score,
                                                  recall_score, f1_score, confusion_matrix)
                    X, y   = df[feature_cols], df[target_col]
                    y_pred = rf_model.predict(X)
                    labels = ["Low", "Medium", "High"]
                    return jsonify({
                        "source":       "training_data",
                        "accuracy":     round(accuracy_score(y, y_pred) * 100, 1),
                        "precision":    round(precision_score(y, y_pred, average="weighted",
                                              labels=labels, zero_division=0) * 100, 1),
                        "recall":       round(recall_score(y, y_pred, average="weighted",
                                              labels=labels, zero_division=0) * 100, 1),
                        "f1_score":     round(f1_score(y, y_pred, average="weighted",
                                              labels=labels, zero_division=0) * 100, 1),
                        "sample_count": len(df),
                        "confusion_matrix": confusion_matrix(y, y_pred, labels=labels).tolist(),
                        "confusion_labels": labels,
                        "feature_importances": dict(zip(
                            feature_cols,
                            [round(float(v)*100, 1) for v in rf_model.feature_importances_]
                        )),
                    })
            except Exception as e:
                print(f"[WARN] Could not compute metrics: {e}")
        return jsonify({"error": "Model or data not available"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/emergency", methods=["GET"])
@rate_limit(limit=30, window=60)
def get_emergency():
    with emergency_lock:
        data = list(reversed(live_emergency_log))
    return jsonify({"source": "live", "data": data})


@app.route("/api/emergency-history", methods=["GET"])
@rate_limit(limit=10, window=60)
def get_emergency_history():
    try:
        response = supabase.table("emergency_log") \
                           .select("*").order("timestamp", desc=True).limit(100).execute()
        if response.data:
            return jsonify({"source": "supabase", "data": [{
                "id":        row.get("id"),
                "type":      row.get("vehicle_type", row.get("type", "Unknown")),
                "lane":      row.get("lane", "Unknown"),
                "action":    row.get("action", ""),
                "frame":     row.get("frame", 0),
                "timestamp": row.get("timestamp", ""),
            } for row in response.data]})
        return jsonify({"source": "none", "data": []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chart", methods=["GET"])
@rate_limit(limit=10, window=60)
def get_chart():
    try:
        if not os.path.exists(BAR_CHART_PNG):
            return jsonify({"error": "Not found"}), 404
        with open(BAR_CHART_PNG, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
        return jsonify({"image": f"data:image/png;base64,{encoded}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/save-lanes-csv", methods=["POST"])
@rate_limit(limit=5, window=60)
def save_lanes_csv():
    try:
        if not os.path.exists(TRAINING_DATA_CSV):
            return jsonify({"error": "training_data.csv not found"}), 404
        df     = pd.read_csv(TRAINING_DATA_CSV)
        latest = df.groupby("lane").last().reset_index()
        data   = [{
            "lane_name":      str(row.get("lane", "")),
            "frame":          int(row.get("frame", 0)),
            "vehicle_count":  int(row.get("vehicle_count", 0)),
            "density":        float(row.get("density", 0)),
            "heavy_ratio":    float(row.get("heavy_ratio", 0)),
            "avg_speed":      float(row.get("avg_speed", 0)),
            "congestion":     str(row.get("congestion", "")),
            "ai_green_time":  float(row.get("green_time", row.get("ai_green", 0))),
            "priority_score": float(row.get("priority_score", 0)),
            "priority_level": str(row.get("priority", "Medium")),
            "timestamp":      datetime.now().isoformat(),
        } for _, row in latest.iterrows()]
        response = supabase.table("lane_status").insert(data).execute()
        return jsonify({"message": f"Saved {len(data)} records", "data": response.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/save-comparison", methods=["POST"])
@rate_limit(limit=5, window=60)
def save_comparison():
    RENAME = {
        "ideal_green_time": "ideal_green",   "trad_green_time": "traditional_green",
        "ai_green_time":    "ai_green",      "trad_wait_time":  "traditional_wait",
        "ai_wait_time":     "ai_wait",       "trad_efficiency": "traditional_efficiency",
        "improvement_%":    "improvement",   "avg_speed_kmh":   "avg_speed",
    }
    try:
        if not os.path.exists(COMPARISON_TABLE_CSV):
            return jsonify({"error": "comparison_table.csv not found"}), 404
        df = pd.read_csv(COMPARISON_TABLE_CSV)
        df.rename(columns=RENAME, inplace=True)
        keep = ["lane","avg_vehicles","avg_density","avg_speed","congestion",
                "ideal_green","traditional_green","ai_green","traditional_wait",
                "ai_wait","trad_utilization","ai_utilization",
                "traditional_efficiency","ai_efficiency","improvement",
                "high_frames","medium_frames","low_frames"]
        df   = df[[c for c in keep if c in df.columns]]
        data = df.to_dict(orient="records")
        for row in data:
            row["timestamp"] = datetime.now().isoformat()
            for k, v in row.items():
                if isinstance(v, np.integer):    row[k] = int(v)
                elif isinstance(v, np.floating): row[k] = float(v)
        response = supabase.table("comparison_results").insert(data).execute()
        return jsonify({"message": f"Saved {len(data)} records", "data": response.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/save-emergency", methods=["POST"])
@rate_limit(limit=5, window=60)
def save_emergency():
    try:
        if not os.path.exists(EMERGENCY_LOG_CSV):
            return jsonify({"error": "Not found"}), 404
        df   = pd.read_csv(EMERGENCY_LOG_CSV)
        data = df.to_dict(orient="records")
        for row in data:
            if "timestamp" not in row:
                row["timestamp"] = datetime.now().isoformat()
            for k, v in row.items():
                if isinstance(v, np.integer):    row[k] = int(v)
                elif isinstance(v, np.floating): row[k] = float(v)
        response = supabase.table("emergency_log").insert(data).execute()
        return jsonify({"message": f"Saved {len(data)} records", "data": response.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── MAIN ───────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  Traffic Management FYP — Flask API v5.0")
    print("  Fuzzy module  : fuzzy_controller.py")
    print(f"  Fuzzy ready   : {fuzzy_ctrl.is_ready()}")
    print("=" * 60)
    start_all_threads()
    print("[INFO] Streams:")
    for lane_key in LANE_CONFIG:
        print(f"  http://localhost:5000/api/stream-local/{lane_key}")
    print("[INFO] Video endpoints:")
    print("  GET    http://localhost:5000/api/videos")
    print("  POST   http://localhost:5000/api/upload-video   (local file)")
    print("  POST   http://localhost:5000/api/save-video-url (Google Drive / URL)")
    print("  DELETE http://localhost:5000/api/delete-video/<id>")
    print("=" * 60)
    app.run(debug=False, port=5000, threaded=True)

    # For Railway deploy:
    # port = int(os.environ.get("PORT", 5000))
    # app.run(debug=False, host="0.0.0.0", port=port, threaded=True)
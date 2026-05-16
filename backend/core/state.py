"""
core/state.py
All shared state — queues, locks, stats, flags.
Import from here in every other module.
"""
import os
import queue
import threading
from collections import defaultdict

from fuzzy_controller import MIN_GREEN

# ── LANE CONFIG ────────────────────────────────────────────
LANE_CONFIG = {
    "LaneA": {"display": "Lane A"},
    "LaneB": {"display": "Lane B"},
    "LaneC": {"display": "Lane C"},
    "LaneD": {"display": "Lane D"},
}

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "uploads")
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

# ── SIGNAL SETTINGS ───────────────────────────────────────
ALL_RED_CLEARANCE    = 2
YELLOW_DURATION      = 3

# ── VIOLATION SETTINGS ────────────────────────────────────
RED_VIOLATION_SECONDS = 5

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

# ── QUEUES ────────────────────────────────────────────────
frame_queues = {lane: queue.Queue(maxsize=QUEUE_MAX_SIZE) for lane in LANE_CONFIG}

# ── LANE STATS ────────────────────────────────────────────
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

# ── Active videos + stop flags ────────────────────────────
# Empty on startup — populated when /api/start-analysis is called
active_videos = {lane: "" for lane in LANE_CONFIG}
stop_flags    = {lane: True for lane in LANE_CONFIG}  # True = stopped

# ── EMERGENCY LOG ─────────────────────────────────────────
live_emergency_log = []
emergency_lock     = threading.Lock()

# ── VIOLATION TRACKER ─────────────────────────────────────
violation_tracker: dict = {lane: {} for lane in LANE_CONFIG}
violation_lock = threading.Lock()

# ── HELPERS ───────────────────────────────────────────────
def allowed_file(filename: str) -> bool:
    return "." in filename and \
           filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
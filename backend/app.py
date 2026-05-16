"""
app.py — Traffic Management FYP
Entry point only. All logic lives in core/ and routes/.
To add a new feature: create routes/newfeature.py and register it here.
"""
import os
import threading
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=UserWarning, module="torch")
from flask import Flask, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime

# ── Environment ────────────────────────────────────────────
load_dotenv(".env.local")
supabase: Client = create_client(
    os.getenv("PROJECT_URL"),
    os.getenv("PUBLISHABLE_KEY"),
)

# ── App ────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

# ── Register blueprints ────────────────────────────────────
from routes.stats      import stats_bp
from routes.analysis   import analysis_bp,   init_supabase as analysis_init
from routes.complaints import complaints_bp,  init_supabase as complaints_init
from routes.emergency  import emergency_bp,   init_supabase as emergency_init
from routes.data       import data_bp,        init_supabase as data_init, init_models
from routes.retrain    import retrain_bp,      init_supabase as retrain_init

app.register_blueprint(stats_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(complaints_bp)
app.register_blueprint(emergency_bp)
app.register_blueprint(data_bp)
app.register_blueprint(retrain_bp)

# ── Inject Supabase into route modules ─────────────────────
analysis_init(supabase)
complaints_init(supabase)
emergency_init(supabase)
data_init(supabase)

retrain_init(supabase)
# ── Inject RF model into data routes ───────────────────────
from core.detection import rf_model, le_priority, le_cong, fuzzy_ctrl, auto_save_to_supabase
init_models(rf_model, le_priority, le_cong)

# ── Error handlers ─────────────────────────────────────────
@app.errorhandler(413)
def file_too_large(e):
    return jsonify({"error": "File too large. Maximum 500 MB.", "max_mb": 500}), 413

# ── Index ──────────────────────────────────────────────────
@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "message":     "Traffic Management FYP API v6.0",
        "fuzzy_ready": fuzzy_ctrl.is_ready(),
        "routes": {
            "stats":      "/api/live-stats, /api/coordination, /api/signal-state, /api/signal-config, /api/vehicle-type-summary",
            "analysis":   "/api/upload-video, /api/start-analysis, /api/stop-analysis, /api/stream-local/<lane>, /api/snapshot/<lane>",
            "complaints": "/api/complaints, /api/complaints/<id>, /api/complaints/stats",
            "emergency":  "/api/emergency, /api/emergency-history",
            "data":       "/api/lanes, /api/comparison, /api/performance, /api/model-metrics, /api/chart",
        }
    })

# ── Health ─────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    from core.signal import signal_controller
    from core.state  import frame_queues, LANE_CONFIG
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

# ── Start background threads ───────────────────────────────
def start_background_services():
    """
    Starts ONLY the signal controller and auto-save on boot.
    Video processing threads start ONLY when /api/start-analysis is called.
    """
    from core.signal import signal_controller

    threading.Thread(target=signal_controller.run, daemon=True).start()
    print("[INFO] Signal controller thread started.")

    threading.Thread(
        target=auto_save_to_supabase,
        args=(supabase,),
        daemon=True
    ).start()
    print("[INFO] Auto-save thread started.")

# ── Main ───────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print("  Traffic Management FYP — Flask API v6.0")
    print("  Video processing starts on /api/start-analysis")
    print("=" * 55)
    start_background_services()
    app.run(debug=False, port=5000, threaded=True)
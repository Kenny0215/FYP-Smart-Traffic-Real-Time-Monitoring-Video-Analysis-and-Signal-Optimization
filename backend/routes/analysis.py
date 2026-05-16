"""
routes/analysis.py
Video upload, start analysis, stop analysis, stream endpoints.
"""
import os
import cv2
import time
import queue
import threading
import numpy as np

from flask import Blueprint, jsonify, request, Response, stream_with_context
from werkzeug.utils import secure_filename

from core.state     import (
    LANE_CONFIG, UPLOAD_FOLDER, allowed_file,
    frame_queues, lane_stats, stats_lock,
    active_videos, stop_flags,
    live_emergency_log, emergency_lock,
    violation_tracker, violation_lock,
)
from core.signal    import signal_controller
from core.detection import process_lane, mjpeg_generator
from fuzzy_controller import MIN_GREEN

analysis_bp = Blueprint("analysis", __name__)

# supabase is injected via app context — set in app.py
_supabase = None

def init_supabase(sb):
    global _supabase
    _supabase = sb


@analysis_bp.route("/api/upload-video", methods=["POST"])
def upload_video():
    if "video" not in request.files:
        return jsonify({"error": "No video file in request"}), 400
    file      = request.files["video"]
    lane_name = request.form.get("lane_name", "Lane A")
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type. Allowed: mp4, avi, mov, mkv"}), 400
    filename     = secure_filename(file.filename)
    save_path    = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)
    file_size_mb = round(os.path.getsize(save_path) / (1024 * 1024), 2)
    return jsonify({
        "message":   "Uploaded successfully",
        "filename":  filename,
        "size_mb":   file_size_mb,
        "lane_name": lane_name,
        "type":      "local",
    })


@analysis_bp.route("/api/start-analysis", methods=["POST"])
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
            args=(lane_key, video_path, LANE_CONFIG[lane_key]["display"], _supabase),
            daemon=True
        ).start()
        started.append(lane_key)
        print(f"[INFO] Analysis started — {lane_key}")

    return jsonify({
        "message": f"Analysis started for {len(started)} lane(s)",
        "started": started,
        "errors":  errors,
    })


@analysis_bp.route("/api/stop-analysis", methods=["POST"])
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

    with violation_lock:
        for lane_key in violation_tracker:
            violation_tracker[lane_key].clear()

    # Clear cached frames
    _last_frame.clear()

    return jsonify({"message": f"Stopped {len(stopped)} lane(s)", "stopped": stopped,
                    "note": "Retraining triggered — POST /api/retrain to run"})


# ── Last frame cache — always serves a real frame even when queue is empty ──
_last_frame: dict = {}


@analysis_bp.route("/api/stream-local/<lane_key>")
def stream_local(lane_key):
    if lane_key not in LANE_CONFIG:
        return jsonify({"error": f"Unknown lane: {lane_key}"}), 404
    return Response(
        stream_with_context(mjpeg_generator(lane_key)),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@analysis_bp.route("/api/snapshot/<lane_key>")
def snapshot(lane_key):
    if lane_key not in LANE_CONFIG:
        return jsonify({"error": f"Unknown lane: {lane_key}"}), 404

    q          = frame_queues.get(lane_key)
    jpeg_bytes = None

    # Try to get latest frame from queue
    if q and not q.empty():
        try:
            jpeg_bytes = q.get_nowait()
            # Put it back so other consumers can read it
            try:   q.put_nowait(jpeg_bytes)
            except queue.Full: pass
            # Cache this good frame
            _last_frame[lane_key] = jpeg_bytes
        except queue.Empty:
            pass

    # Fall back to last cached frame before showing blank
    if jpeg_bytes is None:
        jpeg_bytes = _last_frame.get(lane_key)

    # Only show blank if we truly have nothing cached yet
    if jpeg_bytes is None:
        with stats_lock:
            stats = dict(lane_stats.get(lane_key, {}))
        blank = np.zeros((360, 640, 3), dtype=np.uint8)
        cv2.putText(blank, f"Waiting — {stats.get('lane', lane_key)}",
                    (160, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (60, 60, 60), 1)
        _, buf     = cv2.imencode(".jpg", blank)
        jpeg_bytes = buf.tobytes()

    return Response(
        jpeg_bytes,
        mimetype="image/jpeg",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        }
    )
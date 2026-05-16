"""
routes/stats.py
Live stats, coordination, signal state endpoints.
"""
from flask import Blueprint, jsonify, request
from datetime import datetime

from core.state  import lane_stats, stats_lock, LANE_CONFIG, frame_queues
from core.signal import signal_controller
from fuzzy_controller import coordinate_green_times, MIN_GREEN, MAX_GREEN, CYCLE_TIME

stats_bp = Blueprint("stats", __name__)


@stats_bp.route("/api/live-stats", methods=["GET"])
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


@stats_bp.route("/api/live-stats/<lane_key>", methods=["GET"])
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


@stats_bp.route("/api/coordination", methods=["GET"])
def get_coordination():
    with stats_lock:
        snapshot = {k: dict(v) for k, v in lane_stats.items()}
    coordinated, scores = coordinate_green_times(snapshot)
    sig = signal_controller.get_detail()
    lanes_out = {
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
        "total_score":  round(sum(scores.values()), 2),
        "active_lane":  sig["active_lane"],
        "signal_stage": sig["stage"],
        "remaining":    sig["remaining"],
        "timestamp":    datetime.now().isoformat(),
    })


@stats_bp.route("/api/signal-state", methods=["GET"])
def get_signal_state():
    detail = signal_controller.get_detail()
    detail["timestamp"] = datetime.now().isoformat()
    return jsonify(detail)


@stats_bp.route("/api/signal-config", methods=["GET", "POST"])
def signal_config():
    if request.method == "GET":
        return jsonify({
            "lane_order":        signal_controller.lane_order,
            "all_red_clearance": 2,
            "yellow_duration":   3,
            "min_green":         MIN_GREEN,
            "max_green":         MAX_GREEN,
            "cycle_time":        CYCLE_TIME,
        })
    data    = request.get_json(silent=True) or {}
    updated = []
    if "lane_order" in data:
        signal_controller.update_lane_order(data["lane_order"])
        updated.append("lane_order")
    return jsonify({"message": f"Updated: {', '.join(updated) or 'nothing'}"})


@stats_bp.route("/api/vehicle-type-summary", methods=["GET"])
def vehicle_type_summary():
    with stats_lock:
        raw = {k: dict(v) for k, v in lane_stats.items()}
    totals  = {"Car": 0, "Motorcycle": 0, "Bus": 0, "Truck": 0}
    by_lane = {}
    for lane_key, stats in raw.items():
        vt = stats.get("vehicle_types", totals.copy())
        by_lane[stats["lane"]] = dict(vt)
        for vtype, count in vt.items():
            totals[vtype] = totals.get(vtype, 0) + count
    dominant = max(totals, key=totals.get) if any(totals.values()) else "None"
    return jsonify({"totals": totals, "by_lane": by_lane, "dominant": dominant})
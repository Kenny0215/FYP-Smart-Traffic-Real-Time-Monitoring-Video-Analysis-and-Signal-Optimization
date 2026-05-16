"""
routes/emergency.py
Emergency vehicle log endpoints.
"""
from flask import Blueprint, jsonify
from datetime import datetime

from core.state import live_emergency_log, emergency_lock

emergency_bp = Blueprint("emergency", __name__)
_supabase = None

def init_supabase(sb):
    global _supabase
    _supabase = sb


@emergency_bp.route("/api/emergency", methods=["GET"])
def get_emergency():
    with emergency_lock:
        data = list(reversed(live_emergency_log))
    return jsonify({"source": "live", "data": data})


@emergency_bp.route("/api/emergency-history", methods=["GET"])
def get_emergency_history():
    try:
        response = _supabase.table("emergency_log") \
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
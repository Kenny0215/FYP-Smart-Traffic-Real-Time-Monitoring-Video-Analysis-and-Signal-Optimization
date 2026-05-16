"""
routes/complaints.py
Complaint management endpoints for admin dashboard.
"""
from flask import Blueprint, jsonify, request
from datetime import datetime

complaints_bp = Blueprint("complaints", __name__)
_supabase = None

def init_supabase(sb):
    global _supabase
    _supabase = sb


@complaints_bp.route("/api/complaints", methods=["GET"])
def get_complaints():
    status = request.args.get("status")
    try:
        query = _supabase.table("complaints").select("*").order("timestamp", desc=True)
        if status and status != "all":
            query = query.eq("status", status)
        response = query.limit(200).execute()
        return jsonify({"data": response.data or []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@complaints_bp.route("/api/complaints/<int:complaint_id>", methods=["PATCH"])
def update_complaint(complaint_id):
    data    = request.get_json(silent=True) or {}
    allowed = {"status", "admin_notes"}
    update  = {k: v for k, v in data.items() if k in allowed}

    if not update:
        return jsonify({"error": "No valid fields to update"}), 400
    if "status" in update and update["status"] not in ("pending", "reviewed", "dismissed"):
        return jsonify({"error": "Invalid status"}), 400

    try:
        response = _supabase.table("complaints") \
                            .update(update) \
                            .eq("id", complaint_id) \
                            .execute()
        return jsonify({"message": "Updated", "data": response.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@complaints_bp.route("/api/complaints/stats", methods=["GET"])
def complaints_stats():
    try:
        rows        = (_supabase.table("complaints").select("status, timestamp").execute()).data or []
        today       = datetime.now().date().isoformat()
        return jsonify({
            "total_today": sum(1 for r in rows if r.get("timestamp", "").startswith(today)),
            "pending":     sum(1 for r in rows if r.get("status") == "pending"),
            "reviewed":    sum(1 for r in rows if r.get("status") == "reviewed"),
            "dismissed":   sum(1 for r in rows if r.get("status") == "dismissed"),
            "total":       len(rows),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@complaints_bp.route("/api/complaints/clear-all", methods=["DELETE"])
def clear_all_complaints():
    """Delete all complaints — admin only action."""
    try:
        # Delete all rows by matching id > 0
        _supabase.table("complaints").delete().gt("id", 0).execute()
        return jsonify({"message": "All complaints cleared"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
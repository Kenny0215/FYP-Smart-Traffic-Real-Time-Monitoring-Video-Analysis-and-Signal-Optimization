"""
routes/data.py
Static data endpoints — lanes CSV, comparison, performance, chart, model metrics.
"""
import os
import base64
import numpy as np
import pandas as pd

from flask import Blueprint, jsonify, request
from datetime import datetime

MODEL_DIR            = os.path.join(os.path.dirname(__file__), "..", "model")
COMPARISON_TABLE_CSV = os.path.join(MODEL_DIR, "comparison_output", "comparison_table.csv")
PERFORMANCE_CSV      = os.path.join(MODEL_DIR, "comparison_output", "performance_metrics.csv")
EMERGENCY_LOG_CSV    = os.path.join(MODEL_DIR, "emergency_output",  "emergency_log.csv")
TRAINING_DATA_CSV    = os.path.join(MODEL_DIR, "model_output",      "training_data.csv")
BAR_CHART_PNG        = os.path.join(MODEL_DIR, "comparison_output", "bar_chart.png")

data_bp   = Blueprint("data", __name__)
_supabase = None
_rf_model = None
_le_priority = None
_le_cong  = None

def init_supabase(sb):
    global _supabase
    _supabase = sb

def init_models(rf_model, le_priority, le_cong):
    global _rf_model, _le_priority, _le_cong
    _rf_model    = rf_model
    _le_priority = le_priority
    _le_cong     = le_cong

RENAME = {
    "ideal_green_time": "ideal_green",   "trad_green_time": "traditional_green",
    "ai_green_time":    "ai_green",      "trad_wait_time":  "traditional_wait",
    "ai_wait_time":     "ai_wait",       "trad_efficiency": "traditional_efficiency",
    "improvement_%":    "improvement",   "avg_speed_kmh":   "avg_speed",
}


@data_bp.route("/api/lanes", methods=["GET"])
def get_lanes():
    try:
        response = _supabase.table("lane_status") \
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


@data_bp.route("/api/comparison", methods=["GET"])
def get_comparison():
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
        response = _supabase.table("comparison_results") \
                            .select("*").order("lane").limit(4).execute()
        if response.data:
            return jsonify({"source": "supabase", "data": response.data})
        return jsonify({"error": "No comparison data"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@data_bp.route("/api/performance", methods=["GET"])
def get_performance():
    try:
        if os.path.exists(PERFORMANCE_CSV):
            return jsonify({"source": "csv",
                            "data": pd.read_csv(PERFORMANCE_CSV).to_dict(orient="records")})
        return jsonify({"error": "performance_metrics.csv not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@data_bp.route("/api/model-metrics", methods=["GET"])
def get_model_metrics():
    try:
        if os.path.exists(TRAINING_DATA_CSV) and _rf_model is not None:
            from sklearn.metrics import (accuracy_score, precision_score,
                                          recall_score, f1_score, confusion_matrix)
            df = pd.read_csv(TRAINING_DATA_CSV)
            feature_cols = ["vehicle_count","density","heavy_ratio","avg_speed","congestion_enc"]
            target_col   = "priority_level"
            if all(c in df.columns for c in feature_cols + [target_col]):
                X, y   = df[feature_cols], df[target_col]
                y_pred = _rf_model.predict(X)
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
                        [round(float(v)*100, 1) for v in _rf_model.feature_importances_]
                    )),
                })
        return jsonify({"error": "Model or data not available"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@data_bp.route("/api/chart", methods=["GET"])
def get_chart():
    try:
        if not os.path.exists(BAR_CHART_PNG):
            return jsonify({"error": "Not found"}), 404
        with open(BAR_CHART_PNG, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
        return jsonify({"image": f"data:image/png;base64,{encoded}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@data_bp.route("/api/save-lanes-csv", methods=["POST"])
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
        response = _supabase.table("lane_status").insert(data).execute()
        return jsonify({"message": f"Saved {len(data)} records", "data": response.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@data_bp.route("/api/save-comparison", methods=["POST"])
def save_comparison():
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
        response = _supabase.table("comparison_results").insert(data).execute()
        return jsonify({"message": f"Saved {len(data)} records", "data": response.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@data_bp.route("/api/save-emergency", methods=["POST"])
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
        response = _supabase.table("emergency_log").insert(data).execute()
        return jsonify({"message": f"Saved {len(data)} records", "data": response.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
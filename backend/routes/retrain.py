"""
routes/retrain.py
Incremental RF model retraining endpoint.
Call POST /api/retrain after each analysis session.
Appends new lane stats to training_data.csv and retrains the RF model.
"""
import os
import threading
import joblib
import pandas as pd
import numpy as np
from flask import Blueprint, jsonify
from datetime import datetime

retrain_bp = Blueprint("retrain", __name__)
_retrain_lock = threading.Lock()
_last_retrain  = None
_retrain_status = {"status": "idle", "last": None, "accuracy": None}

MODEL_DIR           = os.path.join(os.path.dirname(__file__), "..", "model")
TRAINING_DATA_CSV   = os.path.join(MODEL_DIR, "model_output", "training_data.csv")
CONGESTION_MODEL_PKL= os.path.join(MODEL_DIR, "model_output", "congestion_model.pkl")

_supabase = None
def init_supabase(sb):
    global _supabase
    _supabase = sb


def _do_retrain():
    """Background thread: append live stats → retrain RF → save model."""
    global _retrain_status
    try:
        _retrain_status["status"] = "running"

        # 1. Pull latest lane_status rows from Supabase
        resp = _supabase.table("lane_status") \
                        .select("*") \
                        .order("timestamp", desc=True) \
                        .limit(500) \
                        .execute()
        new_rows = resp.data or []
        if not new_rows:
            _retrain_status["status"] = "idle"
            return

        # 2. Build dataframe from new rows
        new_df = pd.DataFrame(new_rows)
        rename = {
            "lane_name":      "lane",
            "ai_green_time":  "green_time",
            "priority_level": "priority",
        }
        new_df.rename(columns=rename, inplace=True)

        needed = ["lane","frame","vehicle_count","density","heavy_ratio",
                  "avg_speed","congestion","green_time","priority_score","priority"]
        new_df = new_df[[c for c in needed if c in new_df.columns]]

        # Encode congestion
        cong_map = {"Low": 0, "Medium": 1, "High": 2}
        new_df["congestion_enc"] = new_df["congestion"].map(cong_map).fillna(0).astype(int)

        # 3. Load existing training data and append
        if os.path.exists(TRAINING_DATA_CSV):
            old_df = pd.read_csv(TRAINING_DATA_CSV)
            combined = pd.concat([old_df, new_df], ignore_index=True).drop_duplicates()
        else:
            combined = new_df

        combined.to_csv(TRAINING_DATA_CSV, index=False)

        # 4. Retrain RF
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.preprocessing import LabelEncoder
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import accuracy_score

        feature_cols = ["vehicle_count","density","heavy_ratio","avg_speed","congestion_enc"]
        target_col   = "priority"

        df_clean = combined.dropna(subset=feature_cols + [target_col])
        if len(df_clean) < 20:
            _retrain_status["status"] = "idle"
            return

        X = df_clean[feature_cols]
        y = df_clean[target_col]

        le = LabelEncoder()
        y_enc = le.fit_transform(y)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y_enc, test_size=0.2, random_state=42)

        rf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
        rf.fit(X_train, y_train)
        acc = round(accuracy_score(y_test, rf.predict(X_test)) * 100, 1)

        # 5. Save updated model
        joblib.dump({
            "model":       rf,
            "le_priority": le,
            "le_congestion": None,
        }, CONGESTION_MODEL_PKL)

        # 6. Hot-swap model in detection module
        import core.detection as det
        det.rf_model    = rf
        det.le_priority = le
        det.le_cong     = None

        _retrain_status = {
            "status":   "done",
            "last":     datetime.now().isoformat(),
            "accuracy": acc,
            "samples":  len(df_clean),
        }
        print(f"[RETRAIN] Done — accuracy: {acc}% on {len(df_clean)} samples")

    except Exception as e:
        print(f"[RETRAIN] Failed: {e}")
        _retrain_status["status"] = "idle"


@retrain_bp.route("/api/retrain", methods=["POST"])
def retrain():
    """Trigger incremental RF retraining in background."""
    if _retrain_status["status"] == "running":
        return jsonify({"message": "Retraining already in progress"}), 409

    if not _supabase:
        return jsonify({"error": "Supabase not initialized"}), 500

    threading.Thread(target=_do_retrain, daemon=True).start()
    return jsonify({"message": "Retraining started in background"})


@retrain_bp.route("/api/retrain/status", methods=["GET"])
def retrain_status():
    """Check retraining status and last accuracy."""
    return jsonify(_retrain_status)
import cv2
import time
import threading
from datetime import datetime

try:
    import easyocr
    _reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    EASYOCR_AVAILABLE = True
    print("[INFO] EasyOCR plate reader ready.")
except ImportError:
    _reader = None
    EASYOCR_AVAILABLE = False
    print("[WARN] EasyOCR not installed. Run: pip install easyocr")
except Exception as e:
    _reader = None
    EASYOCR_AVAILABLE = False
    print(f"[WARN] EasyOCR init failed: {e}")

# ── Cooldown tracking ──────────────────────────────────────
_filed_complaints: dict = {}
_filed_lock = threading.Lock()
COMPLAINT_COOLDOWN = 60  # seconds before same track_id can file again


def clear_complaints_for_lane(lane_key: str):
    """Reset cooldown for a lane when signal goes green."""
    with _filed_lock:
        keys = [k for k in _filed_complaints if k.startswith(f"{lane_key}_")]
        for k in keys:
            del _filed_complaints[k]


def already_filed(lane_key: str, track_id: int) -> bool:
    key = f"{lane_key}_{track_id}"
    with _filed_lock:
        if key in _filed_complaints:
            if time.time() - _filed_complaints[key] < COMPLAINT_COOLDOWN:
                return True
            del _filed_complaints[key]
    return False


def mark_filed(lane_key: str, track_id: int):
    with _filed_lock:
        _filed_complaints[f"{lane_key}_{track_id}"] = time.time()


def read_plate(frame, x1: int, y1: int, x2: int, y2: int) -> str:
    """
    Crop the BOTTOM 40% of the vehicle bounding box — that's where
    license plates are located (front bumper / rear bumper area).
    Runs OCR with strict alphanumeric filter and confidence threshold.
    Returns plate string or 'UNKNOWN'.
    """
    if _reader is None:
        return "UNKNOWN"
    try:
        h, w = frame.shape[:2]

        # Bottom 40% of bounding box — plate zone
        box_h    = y2 - y1
        plate_y1 = max(0, y1 + int(box_h * 0.60))   # start at 60% down
        plate_y2 = min(h, y2 + 5)
        plate_x1 = max(0, x1 - 5)
        plate_x2 = min(w, x2 + 5)

        crop = frame[plate_y1:plate_y2, plate_x1:plate_x2]
        if crop.size == 0 or crop.shape[0] < 5 or crop.shape[1] < 5:
            return "UNKNOWN"

        # Upscale small crops for better OCR accuracy
        scale = max(1, 80 // crop.shape[0])
        if scale > 1:
            crop = cv2.resize(crop, None, fx=scale, fy=scale,
                              interpolation=cv2.INTER_CUBIC)

        # Enhance contrast
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        crop = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

        results = _reader.readtext(
            crop,
            allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            min_size=10,
            text_threshold=0.6,   # only accept high-confidence text
            low_text=0.3,
        )
        if not results:
            return "UNKNOWN"

        # Filter by confidence > 0.5 and min length 3
        candidates = [
            r[1].strip().upper().replace(" ", "")
            for r in results
            if r[2] > 0.5 and len(r[1].strip()) >= 3
        ]

        if not candidates:
            return "UNKNOWN"

        # Return longest candidate (most likely a full plate)
        return max(candidates, key=len)

    except Exception as e:
        print(f"[ANPR] OCR error: {e}")
        return "UNKNOWN"


def file_complaint(supabase, frame, lane_key: str, display_name: str,
                   plate: str, vehicle_type: str, track_id: int,
                   violation_type: str = "Red Light Violation",
                   speed: float = 0.0):
    """
    Upload annotated snapshot to Supabase Storage and insert complaint.
    SKIPS if plate is UNKNOWN — reduces noise from unreadable plates.
    """
    # Skip UNKNOWN plates entirely
    if plate == "UNKNOWN":
        return

    # Skip duplicate complaints
    if already_filed(lane_key, track_id):
        return

    mark_filed(lane_key, track_id)
    frame_copy = frame.copy()

    def _upload():
        try:
            _, buffer = cv2.imencode(
                ".jpg", frame_copy, [cv2.IMWRITE_JPEG_QUALITY, 90]
            )
            img_bytes = buffer.tobytes()
            fname     = f"{lane_key}_{track_id}_{int(time.time())}.jpg"

            supabase.storage.from_("snapshots").upload(
                path=fname,
                file=img_bytes,
                file_options={"content-type": "image/jpeg"}
            )

            url_resp     = supabase.storage.from_("snapshots").get_public_url(fname)
            snapshot_url = (
                url_resp if isinstance(url_resp, str)
                else url_resp.get("publicUrl", "")
            )

            supabase.table("complaints").insert({
                "plate_number":   plate,
                "vehicle_type":   vehicle_type,
                "lane":           display_name,
                "violation_type": violation_type,
                "snapshot_url":   snapshot_url,
                "status":         "pending",
                "timestamp": datetime.now().astimezone().isoformat()
            }).execute()

            print(f"[COMPLAINT] Filed — {plate} | {violation_type} | {display_name}")

        except Exception as e:
            print(f"[COMPLAINT] Failed: {e}")

    threading.Thread(target=_upload, daemon=True).start()
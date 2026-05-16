"""
core/signal.py
Traffic signal phase controller.
"""
import time
import enum
import threading

from core.state import (
    LANE_CONFIG, ALL_RED_CLEARANCE, YELLOW_DURATION,
    lane_stats, stats_lock
)
from fuzzy_controller import MIN_GREEN, MAX_GREEN


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


# ── Singleton ─────────────────────────────────────────────
signal_controller = SignalController()
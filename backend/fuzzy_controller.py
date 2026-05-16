import numpy as np
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="skfuzzy")
import skfuzzy as fuzz
from skfuzzy import control as ctrl

# ── Constants (imported by app.py too if needed) ───────────
MIN_GREEN  = 10
MAX_GREEN  = 60
CYCLE_TIME = 120


# ══════════════════════════════════════════════════════════
# Fuzzy Green Time Controller
# ══════════════════════════════════════════════════════════

class FuzzyGreenTimeController:
    """
    Fuzzy logic controller that maps traffic conditions to a
    smooth, continuous green time (10–60 seconds).

    Inputs
    ------
    vehicle_count : 0–30   — number of active tracked vehicles
    avg_speed     : 0–100  — mean speed in km/h
    heavy_ratio   : 0–1.0  — fraction of Bus + Truck vehicles

    Output
    ------
    green_time : 10–60 seconds (continuous, not hard stepped)

    Why fuzzy instead of if/else:
        Hard rule: count=14 → base=40s (sharp jump at boundary)
        Fuzzy    : count=14 → ~53s  (smooth blend across rules)
    """

    def __init__(self):
        self._sim   = None
        self._ready = False
        self._lock  = __import__('threading').Lock()
        self._build()

    def _build(self):
        """Build the fuzzy control system. Called once at init."""
        try:
            # ── Universes of discourse ─────────────────────
            vc  = ctrl.Antecedent(np.arange(0, 31, 1),      'vehicle_count')
            spd = ctrl.Antecedent(np.arange(0, 101, 1),     'avg_speed')
            hr  = ctrl.Antecedent(np.arange(0, 1.01, 0.01), 'heavy_ratio')
            gt  = ctrl.Consequent(np.arange(10, 61, 1),     'green_time')

            # ── Membership functions: vehicle count ────────
            # low    → 0 to 8 vehicles
            # medium → 5 to 17 vehicles (overlaps low and high)
            # high   → 13+ vehicles
            vc['low']    = fuzz.trimf(vc.universe, [0,  0,  8])
            vc['medium'] = fuzz.trimf(vc.universe, [5,  11, 17])
            vc['high']   = fuzz.trimf(vc.universe, [13, 30, 30])

            # ── Membership functions: average speed ────────
            # slow   → 0–30 km/h  (congested)
            # medium → 20–70 km/h (normal flow)
            # fast   → 60–100 km/h (free flow)
            spd['slow']   = fuzz.trimf(spd.universe, [0,  0,  30])
            spd['medium'] = fuzz.trimf(spd.universe, [20, 45, 70])
            spd['fast']   = fuzz.trimf(spd.universe, [60, 100, 100])

            # ── Membership functions: heavy vehicle ratio ──
            # low  → 0 to 40% heavy vehicles
            # high → 30% to 100% heavy vehicles
            hr['low']  = fuzz.trimf(hr.universe, [0,   0,   0.4])
            hr['high'] = fuzz.trimf(hr.universe, [0.3, 1.0, 1.0])

            # ── Membership functions: green time output ────
            # short  → 10–25s  (light traffic)
            # medium → 20–50s  (moderate traffic)
            # long   → 45–60s  (heavy traffic)
            gt['short']  = fuzz.trimf(gt.universe, [10, 10, 25])
            gt['medium'] = fuzz.trimf(gt.universe, [20, 35, 50])
            gt['long']   = fuzz.trimf(gt.universe, [45, 60, 60])

            # ── Fuzzy rules ────────────────────────────────
            #
            # Rule 1: High vehicle count → always long green
            #         (volume alone justifies max time)
            #
            # Rule 2: Medium count + slow speed → long green
            #         (cars stuck, queue not moving, need more time)
            #
            # Rule 3: Medium count + medium speed → medium green
            #         (traffic moving but moderate pressure)
            #
            # Rule 4: Medium count + fast speed → medium green
            #         (vehicles clearing quickly, moderate time ok)
            #
            # Rule 5: Low count + high heavy ratio → medium green
            #         (few vehicles but trucks/buses need longer to clear)
            #
            # Rule 6: Low count + low heavy ratio → short green
            #         (light lane, minimal time needed)
            rules = [
                ctrl.Rule(vc['high'],                   gt['long']),
                ctrl.Rule(vc['medium'] & spd['slow'],   gt['long']),
                ctrl.Rule(vc['medium'] & spd['medium'], gt['medium']),
                ctrl.Rule(vc['medium'] & spd['fast'],   gt['medium']),
                ctrl.Rule(vc['low']    & hr['high'],    gt['medium']),
                ctrl.Rule(vc['low']    & hr['low'],     gt['short']),
            ]

            system     = ctrl.ControlSystem(rules)
            self._sim  = ctrl.ControlSystemSimulation(system)
            self._ready = True
            print("[FuzzyController] Built successfully.")

        except Exception as e:
            print(f"[FuzzyController] Build failed: {e} — rule-based fallback active.")
            self._ready = False

    # ── Public method ──────────────────────────────────────

    def calculate(
        self,
        vehicle_count: int,
        avg_speed:     float,
        heavy_ratio:   float,
        congestion:    str = "Low",   # used only by fallback
    ) -> int:
        """
        Compute green time for one lane.

        Returns int seconds clamped to [MIN_GREEN, MAX_GREEN].
        Falls back to rule-based formula if fuzzy inference fails.

        Parameters
        ----------
        vehicle_count : active tracked vehicles this frame
        avg_speed     : mean speed in km/h
        heavy_ratio   : Bus+Truck fraction (0.0–1.0)
        congestion    : "Low" | "Medium" | "High"  (fallback only)
        """
        if self._ready and self._sim is not None:
            try:
                with self._lock:
                    self._sim.input['vehicle_count'] = float(min(vehicle_count, 30))
                    self._sim.input['avg_speed']     = float(min(max(avg_speed, 0), 100))
                    self._sim.input['heavy_ratio']   = float(min(max(heavy_ratio, 0), 1.0))
                    self._sim.compute()
                    result = self._sim.output['green_time']
                return round(max(MIN_GREEN, min(MAX_GREEN, result)))
            except Exception as e:
                print(f"[FuzzyController] Inference failed: {e} — fallback")

        return self._fallback(vehicle_count, congestion, avg_speed, heavy_ratio)

    def is_ready(self) -> bool:
        """True if fuzzy system built successfully."""
        return self._ready

    # ── Internal fallback ──────────────────────────────────

    @staticmethod
    def _fallback(
        vehicle_count: int,
        congestion:    str,
        avg_speed:     float,
        heavy_ratio:   float,
    ) -> int:
        """
        Rule-based formula used when fuzzy inference is unavailable.
        Same logic as v4.4 calculate_green_time().
        """
        if congestion == "High":
            base, per_v = 40, 0.6
        elif congestion == "Medium":
            base, per_v = 20, 0.8
        else:
            base, per_v = 10, 0.5

        gt  = base + (vehicle_count * per_v)
        gt += max(0, (40 - avg_speed) / 40) * 10
        gt += heavy_ratio * 8
        return round(max(MIN_GREEN, min(MAX_GREEN, gt)))


# ══════════════════════════════════════════════════════════
# Priority Score  (continuous 0–100, used by coordinator)
# ══════════════════════════════════════════════════════════

def calculate_priority_score(
    vehicle_count: int,
    density:       float,
    heavy_ratio:   float,
    avg_speed:     float,
    congestion:    str,
) -> float:
    """
    Compute a continuous urgency score (0–100) for one lane.
    Used by coordinate_green_times() to distribute cycle time.

    Higher score = lane needs green time sooner / longer.

    Weights
    -------
    vehicle_count × 2.5   raw volume pressure   (highest weight)
    density       × 15.0  area saturation
    heavy_ratio   × 20.0  trucks/buses take longer to clear
    speed_factor  × 15.0  slow traffic = more urgent (inverted)
    cong_weight   × 25.0  categorical congestion tier boost
    """
    cong_weight  = {"Low": 0.3, "Medium": 0.6, "High": 1.0}.get(congestion, 0.3)
    speed_factor = max(0.0, (60.0 - avg_speed) / 60.0)   # 0=fast, 1=stopped

    score = (
        vehicle_count * 2.5  +
        density       * 15.0 +
        heavy_ratio   * 20.0 +
        speed_factor  * 15.0 +
        cong_weight   * 25.0
    )
    return round(min(100.0, max(0.0, score)), 2)


# ══════════════════════════════════════════════════════════
# Inter-lane Coordinator
# ══════════════════════════════════════════════════════════

def coordinate_green_times(all_lane_stats: dict, cycle_time: int = CYCLE_TIME):
    """
    Distribute a fixed cycle_time (120s) across all lanes
    proportionally by their priority score.

    Parameters
    ----------
    all_lane_stats : { lane_key: stats_dict }  — current lane_stats snapshot
    cycle_time     : total seconds in one full intersection cycle

    Returns
    -------
    coordinated : { lane_key: int }  — green seconds per lane
    scores      : { lane_key: float } — priority score per lane

    Example (cycle=120s, scores A=80 B=60 C=30 D=10):
        total = 180
        A → 80/180 × 120 = 53s
        B → 60/180 × 120 = 40s
        C → 30/180 × 120 = 20s
        D → 10/180 × 120 = 7s → floored to MIN_GREEN=10s
    """
    scores = {
        lane_key: calculate_priority_score(
            stats["vehicle_count"],
            stats["density"],
            stats["heavy_ratio"],
            stats["avg_speed"],
            stats["congestion"],
        )
        for lane_key, stats in all_lane_stats.items()
    }

    total_score = sum(scores.values())
    coordinated = {}

    if total_score == 0:
        # All lanes idle — distribute equally
        equal = round(cycle_time / max(len(all_lane_stats), 1))
        for lane_key in all_lane_stats:
            coordinated[lane_key] = max(MIN_GREEN, min(MAX_GREEN, equal))
    else:
        for lane_key, score in scores.items():
            raw = (score / total_score) * cycle_time
            coordinated[lane_key] = round(max(MIN_GREEN, min(MAX_GREEN, raw)))

    return coordinated, scores


# ══════════════════════════════════════════════════════════
# Quick self-test  (run: python fuzzy_controller.py)
# ══════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("\n=== FuzzyGreenTimeController self-test ===\n")

    fc = FuzzyGreenTimeController()
    print(f"Controller ready: {fc.is_ready()}\n")

    test_cases = [
        # (vehicle_count, avg_speed, heavy_ratio, congestion, description)
        (2,  80.0, 0.0,  "Low",    "Empty lane, fast"),
        (5,  60.0, 0.0,  "Low",    "Light traffic, moving"),
        (5,  20.0, 0.8,  "Low",    "Few vehicles but mostly trucks"),
        (10, 45.0, 0.2,  "Medium", "Moderate, normal speed"),
        (10, 10.0, 0.1,  "Medium", "Moderate, very slow (congested)"),
        (18, 25.0, 0.3,  "High",   "Heavy traffic, slow"),
        (25, 5.0,  0.5,  "High",   "Severe congestion, nearly stopped"),
    ]

    print(f"{'Description':<40} {'Count':>5} {'Speed':>6} {'Heavy':>6} "
          f"{'Fuzzy':>7} {'Fallback':>9}")
    print("-" * 80)

    for vc, spd, hr, cong, desc in test_cases:
        fuzzy_gt    = fc.calculate(vc, spd, hr, cong)
        fallback_gt = FuzzyGreenTimeController._fallback(vc, cong, spd, hr)
        score       = calculate_priority_score(vc, 0.05, hr, spd, cong)
        print(f"{desc:<40} {vc:>5} {spd:>6.0f} {hr:>6.1f} "
              f"{fuzzy_gt:>6}s  {fallback_gt:>8}s  score={score}")

    print("\n=== Coordinator test ===\n")

    mock_stats = {
        "LaneA": {"vehicle_count": 18, "density": 0.08, "heavy_ratio": 0.3,
                  "avg_speed": 15.0, "congestion": "High"},
        "LaneB": {"vehicle_count": 10, "density": 0.04, "heavy_ratio": 0.1,
                  "avg_speed": 40.0, "congestion": "Medium"},
        "LaneC": {"vehicle_count": 4,  "density": 0.02, "heavy_ratio": 0.0,
                  "avg_speed": 65.0, "congestion": "Low"},
        "LaneD": {"vehicle_count": 1,  "density": 0.01, "heavy_ratio": 0.0,
                  "avg_speed": 80.0, "congestion": "Low"},
    }

    coordinated, scores = coordinate_green_times(mock_stats, cycle_time=120)
    total = sum(scores.values())
    print(f"{'Lane':<8} {'Score':>7} {'Share':>7} {'Green':>7}")
    print("-" * 35)
    for lane, score in scores.items():
        print(f"{lane:<8} {score:>7.1f} {score/total*100:>6.1f}%  "
              f"{coordinated[lane]:>5}s")
    print(f"\nTotal cycle: {sum(coordinated.values())}s "
          f"(target {CYCLE_TIME}s, diff due to MIN/MAX clamping)")
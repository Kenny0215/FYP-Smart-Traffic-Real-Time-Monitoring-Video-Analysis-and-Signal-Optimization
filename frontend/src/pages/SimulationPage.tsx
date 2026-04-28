import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Brain, ShieldAlert, Wifi, WifiOff, Clock, Activity, Zap } from 'lucide-react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { cn } from '../utils';

const FLASK_URL   = 'http://127.0.0.1:5000';
const CS          = 560;
const RW          = 120;
const CTR         = CS / 2;
const YELLOW_SECS = 3;
const MIN_GREEN   = 10;
const CYCLE_TIME  = 120;
const POLL_MS     = 2000;

interface LaneStat {
  lane_key:          string;
  lane:              string;
  vehicle_count:     number;
  congestion:        string;
  green_time:        number;
  ai_green_time:     number;
  coordinated_green: number;
  priority:          string;
  priority_score:    number;
  avg_speed:         number;
  density:           number;
  heavy_ratio:       number;
  fps:               number;
  frame:             number;
}
interface Emergency { lane: string; type: string; timestamp: string; }
type Phase = 'green' | 'yellow' | 'red';

interface Vehicle {
  id:    number;
  lane:  string;
  pos:   number;
  speed: number;
  color: string;
}

type EmergencySeverity = 'critical' | 'high' | 'medium' | 'low';

interface EmergencyScenario {
  id:          string;
  label:       string;
  description: string;
  severity:    EmergencySeverity;
  greenSecs:   number;
  icon:        string;
}

interface EmergencyVehicleType {
  id:        string;
  label:     string;
  icon:      string;
  color:     string;
  bgColor:   string;
  scenarios: EmergencyScenario[];
}

const EMERGENCY_TYPES: EmergencyVehicleType[] = [
  {
    id: 'ambulance', label: 'Ambulance', icon: '🚑',
    color: 'text-rose-400', bgColor: 'bg-rose-500/10',
    scenarios: [
      { id: 'cardiac',      label: 'Cardiac Arrest',    icon: '❤️',  severity: 'critical', greenSecs: 60, description: 'Patient in cardiac arrest — CPR in progress, every second critical for survival.' },
      { id: 'near_death',   label: 'Near Death',        icon: '🆘',  severity: 'critical', greenSecs: 60, description: 'Multiple trauma victims, near-death condition, immediate surgery required.' },
      { id: 'stroke',       label: 'Stroke / Brain',    icon: '🧠',  severity: 'critical', greenSecs: 60, description: 'Suspected stroke — time-sensitive, brain damage worsens every minute delayed.' },
      { id: 'broken_bone',  label: 'Broken Bone',       icon: '🦴',  severity: 'high',     greenSecs: 45, description: 'Severe fracture with heavy bleeding — patient stable but needs urgent surgery.' },
      { id: 'leg_broken',   label: 'Leg Broken',        icon: '🦿',  severity: 'high',     greenSecs: 45, description: 'Compound leg fracture from road accident, patient in severe pain.' },
      { id: 'head_injury',  label: 'Head Injury',       icon: '🤕',  severity: 'high',     greenSecs: 45, description: 'Serious head trauma, possible concussion or internal bleeding.' },
      { id: 'chest_pain',   label: 'Chest Pain',        icon: '💔',  severity: 'medium',   greenSecs: 30, description: 'Acute chest pain — possible heart attack, requires urgent evaluation.' },
      { id: 'minor_injury', label: 'Minor Injury',      icon: '🩹',  severity: 'low',      greenSecs: 20, description: 'Minor cuts and bruises, patient conscious and stable.' },
    ],
  },
  {
    id: 'fire_truck', label: 'Fire Truck', icon: '🚒',
    color: 'text-orange-400', bgColor: 'bg-orange-500/10',
    scenarios: [
      { id: 'building_fire',  label: 'Building Fire',    icon: '🔥',  severity: 'critical', greenSecs: 60, description: 'Multi-storey building ablaze, occupants trapped — immediate response required.' },
      { id: 'explosion',      label: 'Gas Explosion',    icon: '💥',  severity: 'critical', greenSecs: 60, description: 'Gas explosion reported, risk of secondary blast and casualties.' },
      { id: 'vehicle_fire',   label: 'Vehicle Fire',     icon: '🚗',  severity: 'high',     greenSecs: 45, description: 'Car fire on road, risk of fuel tank explosion and spread.' },
      { id: 'forest_fire',    label: 'Forest / Grass',   icon: '🌲',  severity: 'high',     greenSecs: 45, description: 'Grass or forest fire spreading toward residential area.' },
      { id: 'small_fire',     label: 'Small Fire',       icon: '🕯️', severity: 'medium',   greenSecs: 30, description: 'Contained small fire — no casualties reported, precautionary response.' },
      { id: 'rescue_op',      label: 'Rescue Operation', icon: '⛑️', severity: 'medium',   greenSecs: 30, description: 'Technical rescue operation — person trapped in machinery or rubble.' },
    ],
  },
  {
    id: 'police', label: 'Police', icon: '🚓',
    color: 'text-blue-400', bgColor: 'bg-blue-500/10',
    scenarios: [
      { id: 'active_chase',   label: 'Active Chase',      icon: '🏃',  severity: 'critical', greenSecs: 60, description: 'High-speed vehicle pursuit in progress — armed suspect, public safety risk.' },
      { id: 'armed_robbery',  label: 'Armed Robbery',     icon: '🔫',  severity: 'critical', greenSecs: 60, description: 'Armed robbery in progress — officers responding to life-threatening scene.' },
      { id: 'hostage',        label: 'Hostage Situation', icon: '⚠️',  severity: 'critical', greenSecs: 60, description: 'Active hostage situation, tactical unit en route.' },
      { id: 'accident_resp',  label: 'Accident Response', icon: '🚧',  severity: 'high',     greenSecs: 45, description: 'Major road accident with injuries — securing perimeter and clearing road.' },
      { id: 'crowd_control',  label: 'Crowd Control',     icon: '👥',  severity: 'medium',   greenSecs: 30, description: 'Large crowd disturbance — units needed for crowd management.' },
      { id: 'routine_patrol', label: 'Routine Patrol',    icon: '🔵',  severity: 'low',      greenSecs: 20, description: 'Standard patrol vehicle — no immediate emergency, priority escort.' },
    ],
  },
  {
    id: 'vip', label: 'VIP Convoy', icon: '🚐',
    color: 'text-purple-400', bgColor: 'bg-purple-500/10',
    scenarios: [
      { id: 'head_state',     label: 'Head of State',    icon: '👑',  severity: 'critical', greenSecs: 60, description: 'Official head of state convoy — maximum security clearance, all lanes yield.' },
      { id: 'state_minister', label: 'State Minister',   icon: '🎖️', severity: 'high',     greenSecs: 45, description: 'Government minister convoy with security escort.' },
      { id: 'diplomatic',     label: 'Diplomatic Visit', icon: '🌐',  severity: 'high',     greenSecs: 45, description: 'Foreign dignitary — protocol requires uninterrupted transit.' },
      { id: 'medical_vip',    label: 'Medical Transfer', icon: '🏥',  severity: 'high',     greenSecs: 45, description: 'Critical organ or blood supply transport — time-sensitive medical convoy.' },
      { id: 'celebrity',      label: 'Celebrity / Event',icon: '⭐',  severity: 'medium',   greenSecs: 30, description: 'High-profile event convoy — coordinated traffic management requested.' },
    ],
  },
];

const SEVERITY_CONFIG: Record<EmergencySeverity, { label: string; color: string; bg: string; pulse: boolean }> = {
  critical: { label: 'CRITICAL',  color: 'text-rose-400',   bg: 'bg-rose-500/20   border-rose-500/50',   pulse: true  },
  high:     { label: 'HIGH',      color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/50', pulse: true  },
  medium:   { label: 'MEDIUM',    color: 'text-amber-400',  bg: 'bg-amber-500/20  border-amber-500/50',  pulse: false },
  low:      { label: 'LOW',       color: 'text-blue-400',   bg: 'bg-blue-500/20   border-blue-500/50',   pulse: false },
};

const SEVERITY_RANK: Record<EmergencySeverity, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

const VEHICLE_TYPE_RANK: Record<string, number> = {
  ambulance:  4,
  fire_truck: 3,
  police:     2,
  vip:        1,
};

interface ActiveEmergency {
  vehicleType: EmergencyVehicleType;
  scenario:    EmergencyScenario;
  lane:        string;
  laneKey:     string;
  triggeredAt: number;
  rank:        number;
}

type StagedEntry = {
  vehicleType: EmergencyVehicleType;
  scenario:    EmergencyScenario;
  lane:        string;
};

const emergencyRank = (em: ActiveEmergency): number =>
  SEVERITY_RANK[em.scenario.severity] * 10 + (VEHICLE_TYPE_RANK[em.vehicleType.id] ?? 0);

const STOP: Record<string, number> = {
  'Lane A': CTR - RW / 2 - 20,
  'Lane B': CTR - RW / 2 - 20,
  'Lane C': CTR - RW / 2 - 20,
  'Lane D': CTR - RW / 2 - 20,
};
const EXIT_POS = CS + 60;

const vXY = (lane: string, pos: number) => {
  const w = 14, h = 22;
  if (lane === 'Lane A') return { x: CTR - RW / 2 + RW / 4 - w / 2, y: pos,              w, h };
  if (lane === 'C')      return { x: CTR + RW / 2 - RW / 4 - w / 2, y: CS - pos - h,     w, h };
  if (lane === 'Lane C') return { x: CTR + RW / 2 - RW / 4 - w / 2, y: CS - pos - h,     w, h };
  if (lane === 'Lane B') return { x: CS - pos - h,  y: CTR - RW / 2 + RW / 4 - w / 2, w: h, h: w };
  return                        { x: pos,           y: CTR + RW / 2 - RW / 4 - w / 2, w: h, h: w };
};

const TLIGHT_POS: Record<string, { x: number; y: number }> = {
  'Lane A': { x: CTR + RW / 2 + 12, y: CTR - RW / 2 - 38 },
  'Lane B': { x: CTR + RW / 2 + 12, y: CTR + RW / 2 + 6  },
  'Lane C': { x: CTR - RW / 2 - 24, y: CTR + RW / 2 + 6  },
  'Lane D': { x: CTR - RW / 2 - 24, y: CTR - RW / 2 - 38 },
};

const LANE_COLORS: Record<string, string> = {
  'Lane A': '#33b5e5',
  'Lane B': '#ffbb33',
  'Lane C': '#aa66cc',
  'Lane D': '#00d4aa',
};

const sortByScore = (lanes: LaneStat[]): LaneStat[] =>
  [...lanes].sort((a, b) => {
    const sd = (b.priority_score ?? 0) - (a.priority_score ?? 0);
    if (Math.abs(sd) > 0.5) return sd;
    return b.vehicle_count - a.vehicle_count;
  });

export const SimulationPage = ({ hasData }: { hasData: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [lanes,         setLanes]         = useState<LaneStat[]>([]);
  const [connected,     setConnected]     = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState('');
  const [activeLaneKey, setActiveLaneKey] = useState<string | null>(null);
  const [phase,         setPhase]         = useState<Phase>('red');
  const [countdown,     setCountdown]     = useState(0);
  const [cycleLog,      setCycleLog]      = useState<string[]>([]);
  const [totalCycles,   setTotalCycles]   = useState(0);
  const [emergencyLane, setEmergencyLane] = useState<string | null>(null);
  const [simSpeed,      setSimSpeed]      = useState(1);
  const simSpeedRef = useRef(1);

  const [activeEmergencies,   setActiveEmergencies]   = useState<ActiveEmergency[]>([]);
  const [selectedVehicleType, setSelectedVehicleType] = useState<EmergencyVehicleType>(EMERGENCY_TYPES[0]);
  const [selectedScenario,    setSelectedScenario]    = useState<EmergencyScenario>(EMERGENCY_TYPES[0].scenarios[0]);
  const [selectedLane,        setSelectedLane]        = useState<string>('Lane A');
  const [stagedEmergencies,   setStagedEmergencies]   = useState<StagedEntry[]>([]);
  const [showScenarioPanel,   setShowScenarioPanel]   = useState(false);
  const activeEmergenciesRef = useRef<ActiveEmergency[]>([]);

  const lanesRef         = useRef<LaneStat[]>([]);
  const activeLaneKeyRef = useRef<string | null>(null);
  const phaseRef         = useRef<Phase>('red');
  const countdownRef     = useRef(0);
  const cycleQueueRef    = useRef<string[]>([]);
  const emergencyLaneRef = useRef<string | null>(null);
  const signalsRef       = useRef<Record<string, Phase>>({});
  const vehiclesRef      = useRef<Vehicle[]>([]);
  const nextVehicleId    = useRef(0);
  const hasDataRef       = useRef(false);

  useEffect(() => { simSpeedRef.current = simSpeed; }, [simSpeed]);

  useEffect(() => {
    hasDataRef.current = hasData;
    if (!hasData) {
      setLanes([]);
      setActiveLaneKey(null);
      setPhase('red');
      setCountdown(0);
      setCycleLog([]);
      setEmergencyLane(null);
      setActiveEmergencies([]);
      setStagedEmergencies([]);
      vehiclesRef.current        = [];
      activeLaneKeyRef.current   = null;
      signalsRef.current         = {};
      emergencyLaneRef.current   = null;
      activeEmergenciesRef.current = [];
      cycleQueueRef.current      = [];
    }
  }, [hasData]);

  useEffect(() => {
    activeEmergenciesRef.current = activeEmergencies;
    if (activeEmergencies.length === 0) {
      setEmergencyLane(null);
      emergencyLaneRef.current = null;
    } else {
      const top = [...activeEmergencies].sort((a, b) => b.rank - a.rank)[0];
      setEmergencyLane(top.lane);
      emergencyLaneRef.current = top.lane;
    }
  }, [activeEmergencies]);

  const addToStaged = useCallback(() => {
    const duplicate = stagedEmergencies.some((e: StagedEntry) => e.lane === selectedLane);
    if (duplicate) {
      setStagedEmergencies((prev: StagedEntry[]) =>
        prev.map((e: StagedEntry) => e.lane === selectedLane
          ? { vehicleType: selectedVehicleType, scenario: selectedScenario, lane: selectedLane }
          : e
        )
      );
    } else {
      setStagedEmergencies((prev: StagedEntry[]) => [
        ...prev,
        { vehicleType: selectedVehicleType, scenario: selectedScenario, lane: selectedLane },
      ]);
    }
  }, [selectedVehicleType, selectedScenario, selectedLane, stagedEmergencies]);

  const removeStagedEntry = useCallback((lane: string) => {
    setStagedEmergencies((prev: StagedEntry[]) => prev.filter((e: StagedEntry) => e.lane !== lane));
  }, []);

  const triggerScenarioEmergency = useCallback(() => {
    const all = lanesRef.current;
    if (stagedEmergencies.length === 0) return;

    const newEntries: ActiveEmergency[] = stagedEmergencies
      .map(staged => {
        const laneData = all.find(l => l.lane === staged.lane);
        if (!laneData) return null;
        const dummy: ActiveEmergency = {
          vehicleType: staged.vehicleType,
          scenario:    staged.scenario,
          lane:        staged.lane,
          laneKey:     laneData.lane_key,
          triggeredAt: Date.now(),
          rank:        0,
        };
        return { ...dummy, rank: emergencyRank(dummy) };
      })
      .filter(Boolean) as ActiveEmergency[];

    if (newEntries.length === 0) return;

    setActiveEmergencies(prev => {
      const stagedLanes = newEntries.map(e => e.lane);
      const kept        = prev.filter(e => !stagedLanes.includes(e.lane));
      const merged      = [...kept, ...newEntries];
      activeEmergenciesRef.current = merged;
      return merged;
    });

    setStagedEmergencies([]);
    setShowScenarioPanel(false);

    const hasUrgent = newEntries.some(
      e => e.scenario.severity === 'critical' || e.scenario.severity === 'high'
    );
    if (hasUrgent) {
      const k = activeLaneKeyRef.current;
      if (k) signalsRef.current = { ...signalsRef.current, [k]: 'yellow' };
      phaseRef.current     = 'yellow';
      countdownRef.current = 1;
      setPhase('yellow');
      setCountdown(1);
    }

    const summary = newEntries
      .sort((a, b) => b.rank - a.rank)
      .map(e => `${e.vehicleType.icon}${e.lane}[${SEVERITY_CONFIG[e.scenario.severity].label}]`)
      .join(' · ');
    setCycleLog(prev => [
      `${new Date().toLocaleTimeString()} — 🚨 CONFIRMED: ${summary}`,
      ...prev.slice(0, 9),
    ]);
  }, [stagedEmergencies]);

  const clearEmergencyForLane = useCallback((lane: string) => {
    setActiveEmergencies(prev => {
      const next = prev.filter(e => e.lane !== lane);
      activeEmergenciesRef.current = next;
      return next;
    });
    setCycleLog(log => [
      `${new Date().toLocaleTimeString()} — ✅ Emergency cleared for ${lane}`,
      ...log.slice(0, 9),
    ]);
  }, []);

  const clearAllEmergencies = useCallback(() => {
    setActiveEmergencies([]);
    activeEmergenciesRef.current = [];
    setCycleLog(log => [
      `${new Date().toLocaleTimeString()} — ✅ All emergencies cleared`,
      ...log.slice(0, 9),
    ]);
  }, []);

  const activateLane = useCallback((next: LaneStat, reason: string) => {
    const all = lanesRef.current;
    const greenDur = Math.max(
      next.coordinated_green ?? next.ai_green_time ?? next.green_time ?? MIN_GREEN,
      MIN_GREEN
    );
    activeLaneKeyRef.current = next.lane_key;
    phaseRef.current         = 'green';
    countdownRef.current     = greenDur;
    const sigs: Record<string, Phase> = {};
    all.forEach(l => { sigs[l.lane_key] = 'red'; });
    sigs[next.lane_key] = 'green';
    signalsRef.current  = sigs;
    setActiveLaneKey(next.lane_key);
    setPhase('green');
    setCountdown(greenDur);
    setTotalCycles(c => c + 1);
    const fuzzyGt = next.green_time ?? next.ai_green_time ?? 0;
    const coordGt = next.coordinated_green ?? fuzzyGt;
    setCycleLog(prev => [
      `${new Date().toLocaleTimeString()} — ${next.lane} → Coord:${coordGt}s Fuzzy:${fuzzyGt}s +${YELLOW_SECS}s yellow (${reason})`,
      ...prev.slice(0, 9),
    ]);
  }, []);

  const advanceCycle = useCallback(() => {
    const all = lanesRef.current;
    const ems = activeEmergenciesRef.current;
    if (!all.length) return;

    const sortedEms = [...ems].sort((a, b) => b.rank - a.rank);
    const topEm     = sortedEms[0] ?? null;

    if (topEm) {
      const emLane = all.find(l => l.lane === topEm.lane);
      if (emLane) {
        const sev = topEm.scenario.severity;
        if (sev === 'critical' || sev === 'high') {
          if (emLane.lane_key !== activeLaneKeyRef.current) {
            cycleQueueRef.current    = cycleQueueRef.current.filter(k => k !== emLane.lane_key);
            const overrideGreen      = topEm.scenario.greenSecs;
            activeLaneKeyRef.current = emLane.lane_key;
            phaseRef.current         = 'green';
            countdownRef.current     = overrideGreen;
            const sigs: Record<string, Phase> = {};
            all.forEach(l => { sigs[l.lane_key] = 'red'; });
            sigs[emLane.lane_key] = 'green';
            signalsRef.current = sigs;
            setActiveLaneKey(emLane.lane_key);
            setPhase('green');
            setCountdown(overrideGreen);
            setTotalCycles(c => c + 1);
            const allRanked = sortedEms
              .map(e => `${e.vehicleType.icon}${e.lane}[${SEVERITY_CONFIG[e.scenario.severity].label}]`)
              .join(' > ');
            setCycleLog(prev => [
              `${new Date().toLocaleTimeString()} — 🚨 DECISION: ${topEm.vehicleType.icon} ${topEm.vehicleType.label} [${topEm.scenario.icon} ${topEm.scenario.label}] → ${topEm.lane} ${overrideGreen}s | ${allRanked}`,
              ...prev.slice(0, 9),
            ]);
            return;
          }
        }
        if (sev === 'medium') {
          cycleQueueRef.current = [
            emLane.lane_key,
            ...cycleQueueRef.current.filter(k => k !== emLane.lane_key),
          ];
        }
        if (sev === 'low' && !cycleQueueRef.current.includes(emLane.lane_key)) {
          cycleQueueRef.current = [emLane.lane_key, ...cycleQueueRef.current];
        }
      }
    }

    const backendEm = emergencyLaneRef.current;
    if (ems.length === 0 && backendEm) {
      const emLane = all.find(l => l.lane === backendEm);
      if (emLane && emLane.lane_key !== activeLaneKeyRef.current) {
        cycleQueueRef.current = cycleQueueRef.current.filter(k => k !== emLane.lane_key);
        activateLane(emLane, '🚨 YOLO emergency override');
        return;
      }
    }

    if (cycleQueueRef.current.length === 0) {
      const sorted = sortByScore(all);
      cycleQueueRef.current = sorted.map(l => l.lane_key);
      setCycleLog(prev => [
        `── New round — Score order: ${sorted.map(l => `${l.lane}(${(l.priority_score ?? 0).toFixed(0)})`).join(' → ')} ──`,
        ...prev.slice(0, 9),
      ]);
    }

    const nextKey = cycleQueueRef.current.shift();
    const next    = all.find(l => l.lane_key === nextKey);
    if (!next) { advanceCycle(); return; }

    const laneEm = ems.find(e => e.lane === next.lane &&
      (e.scenario.severity === 'medium' || e.scenario.severity === 'low'));

    if (laneEm) {
      const overrideGreen      = laneEm.scenario.greenSecs;
      activeLaneKeyRef.current = next.lane_key;
      phaseRef.current         = 'green';
      countdownRef.current     = overrideGreen;
      const sigs: Record<string, Phase> = {};
      all.forEach(l => { sigs[l.lane_key] = 'red'; });
      sigs[next.lane_key] = 'green';
      signalsRef.current = sigs;
      setActiveLaneKey(next.lane_key);
      setPhase('green');
      setCountdown(overrideGreen);
      setTotalCycles(c => c + 1);
      setCycleLog(prev => [
        `${new Date().toLocaleTimeString()} — ${laneEm.vehicleType.icon} ${next.lane} → ${overrideGreen}s [${SEVERITY_CONFIG[laneEm.scenario.severity].label}: ${laneEm.scenario.label}]`,
        ...prev.slice(0, 9),
      ]);
    } else {
      activateLane(next, `Score:${(next.priority_score ?? 0).toFixed(0)} RF:${next.priority} | ${next.vehicle_count} veh`);
    }
  }, [activateLane]);

  // ── 1s ticker ────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      if (countdownRef.current > 0) {
        countdownRef.current -= 1;
        setCountdown(countdownRef.current);
      } else {
        if (phaseRef.current === 'green') {
          phaseRef.current     = 'yellow';
          countdownRef.current = YELLOW_SECS;
          const k = activeLaneKeyRef.current;
          if (k) signalsRef.current = { ...signalsRef.current, [k]: 'yellow' };
          setPhase('yellow');
          setCountdown(YELLOW_SECS);
        } else if (phaseRef.current === 'yellow') {
          const k = activeLaneKeyRef.current;
          if (k) signalsRef.current = { ...signalsRef.current, [k]: 'red' };
          phaseRef.current = 'red';
          setPhase('red');
          advanceCycle();
        }
      }
    };
    const t = setInterval(tick, Math.round(1000 / simSpeedRef.current));
    return () => clearInterval(t);
  }, [advanceCycle, simSpeed]);

  // ── Poll stats ───────────────────────────────────────────────
  const pollStats = useCallback(async () => {
    if (!hasDataRef.current) return;
    try {
      const res = await fetch(`${FLASK_URL}/api/live-stats`);
      if (!res.ok) { setConnected(false); return; }
      const json = await res.json();
      const data: LaneStat[] = (json.data || []).map((l: any) => ({
        ...l,
        coordinated_green: Number(l.coordinated_green ?? l.ai_green_time ?? l.green_time ?? MIN_GREEN),
        green_time:        Number(l.green_time        ?? l.ai_green_time ?? MIN_GREEN),
        ai_green_time:     Number(l.ai_green_time     ?? l.green_time    ?? MIN_GREEN),
        priority_score:    Number(l.priority_score    ?? 0),
        priority:          l.priority    || 'Low',
        density:           Number(l.density       || 0),
        heavy_ratio:       Number(l.heavy_ratio   || 0),
        vehicle_count:     Number(l.vehicle_count || 0),
        avg_speed:         Number(l.avg_speed     || 0),
      }));
      lanesRef.current = data;
      setLanes(data);
      setConnected(true);
      setLastUpdated(new Date().toLocaleTimeString());
      if (data.length > 0 && !activeLaneKeyRef.current) advanceCycle();
    } catch { setConnected(false); }
  }, [advanceCycle]);

  // ── Poll emergency ───────────────────────────────────────────
  const pollEmergency = useCallback(async () => {
    try {
      const res  = await fetch(`${FLASK_URL}/api/emergency`);
      if (!res.ok) return;
      const json = await res.json();
      const alerts: Emergency[] = json.data || json || [];
      const recent = alerts.find(e => Date.now() - new Date(e.timestamp).getTime() < 30000);
      const el     = recent?.lane ?? null;
      emergencyLaneRef.current = el;
      setEmergencyLane(el);
      if (el) {
        const active = lanesRef.current.find(l => l.lane_key === activeLaneKeyRef.current);
        if (active && active.lane !== el) {
          const k = activeLaneKeyRef.current;
          if (k) signalsRef.current = { ...signalsRef.current, [k]: 'yellow' };
          phaseRef.current     = 'yellow';
          countdownRef.current = 1;
          setPhase('yellow');
          setCountdown(1);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    pollStats(); pollEmergency();
    const p = setInterval(() => { pollStats(); pollEmergency(); }, POLL_MS);
    return () => clearInterval(p);
  }, [pollStats, pollEmergency]);

  // ── Canvas draw loop ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let rafId: number;

    const rrect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    };

    const drawLight = (x: number, y: number, ph: Phase) => {
      ctx.fillStyle = '#1a1f28';
      rrect(x, y, 16, 44, 3);
      ctx.fill();
      ctx.strokeStyle = '#333d4d';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 8, y + 9, 5, 0, Math.PI * 2);
      if (ph === 'red') { ctx.fillStyle = '#ff3333'; ctx.shadowBlur = 14; ctx.shadowColor = '#ff3333'; }
      else              { ctx.fillStyle = '#3a1515'; ctx.shadowBlur = 0; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x + 8, y + 22, 5, 0, Math.PI * 2);
      if (ph === 'yellow') { ctx.fillStyle = '#ffcc00'; ctx.shadowBlur = 14; ctx.shadowColor = '#ffcc00'; }
      else                 { ctx.fillStyle = '#2a2410'; ctx.shadowBlur = 0; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x + 8, y + 35, 5, 0, Math.PI * 2);
      if (ph === 'green') { ctx.fillStyle = '#00e5aa'; ctx.shadowBlur = 14; ctx.shadowColor = '#00e5aa'; }
      else                { ctx.fillStyle = '#0a2018'; ctx.shadowBlur = 0; }
      ctx.fill(); ctx.shadowBlur = 0;
    };

    const spawnVehicles = () => {
      if (!hasDataRef.current) { vehiclesRef.current = []; return; }
      lanesRef.current.forEach(lane => {
        const existing = vehiclesRef.current.filter(v => v.lane === lane.lane).length;
        const target   = Math.min(Math.floor(lane.vehicle_count / 3) + 1, 7);
        if (existing < target && Math.random() < 0.045) {
          vehiclesRef.current.push({
            id:    nextVehicleId.current++,
            lane:  lane.lane,
            pos:   -30,
            speed: 1.4 + Math.random() * 1.2,
            color: LANE_COLORS[lane.lane] || '#aaaaaa',
          });
        }
      });
    };

    const moveVehicles = () => {
      vehiclesRef.current = vehiclesRef.current.filter(v => {
        const laneData = lanesRef.current.find(l => l.lane === v.lane);
        const laneKey  = laneData?.lane_key ?? '';
        const sig      = signalsRef.current[laneKey] ?? 'red';
        const stopAt   = STOP[v.lane] ?? (CTR - RW / 2 - 20);
        const mustStop = sig === 'red' || sig === 'yellow';
        const ahead    = vehiclesRef.current.find(
          o => o.lane === v.lane && o.id !== v.id && o.pos > v.pos && o.pos - v.pos < 36
        );
        let blocked = !!ahead;
        if (mustStop && v.pos < stopAt && v.pos + v.speed >= stopAt) blocked = true;
        if (!blocked) v.pos += v.speed;
        return v.pos < EXIT_POS;
      });
    };

    const dashLine = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.save();
      ctx.strokeStyle = '#ffffff28';
      ctx.lineWidth   = 2;
      ctx.setLineDash([18, 14]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    const zebra = (x: number, y: number, w: number, h: number) => {
      const isHoriz = w > h;
      ctx.fillStyle = '#ffffff0a';
      if (isHoriz) { for (let i = 0; i < w; i += 10) { ctx.fillRect(x + i, y, 6, h); } }
      else         { for (let i = 0; i < h; i += 10) { ctx.fillRect(x, y + i, w, 6); } }
    };

    const drawFrame = () => {
      ctx.fillStyle = '#1a2332';
      ctx.fillRect(0, 0, CS, CS);

      // Grass corners
      ctx.fillStyle = '#1e2d1e';
      ctx.fillRect(0,            0,            CTR - RW / 2, CTR - RW / 2);
      ctx.fillRect(CTR + RW / 2, 0,            CTR - RW / 2, CTR - RW / 2);
      ctx.fillRect(0,            CTR + RW / 2, CTR - RW / 2, CTR - RW / 2);
      ctx.fillRect(CTR + RW / 2, CTR + RW / 2, CTR - RW / 2, CTR - RW / 2);

      ctx.strokeStyle = '#3a4a3a';
      ctx.lineWidth = 2;
      [[CTR - RW / 2, CTR - RW / 2], [CTR + RW / 2, CTR - RW / 2],
       [CTR - RW / 2, CTR + RW / 2], [CTR + RW / 2, CTR + RW / 2]
      ].forEach(([cx, cy]) => {
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
      });

      // Road surface
      ctx.fillStyle = '#2a3040';
      ctx.fillRect(CTR - RW / 2, 0,            RW, CS);
      ctx.fillRect(0,            CTR - RW / 2, CS, RW);

      // Road texture
      ctx.fillStyle = '#ffffff04';
      for (let i = 0; i < CS; i += 8) {
        if (i < CTR - RW / 2 || i > CTR + RW / 2) continue;
        for (let j = 0; j < CS; j += 8) {
          if (Math.random() > 0.3) ctx.fillRect(i, j, 4, 4);
        }
      }

      // Road edges
      ctx.strokeStyle = '#ffffff18';
      ctx.lineWidth = 1.5;
      [[CTR - RW / 2, 0,            CTR - RW / 2, CTR - RW / 2],
       [CTR + RW / 2, 0,            CTR + RW / 2, CTR - RW / 2],
       [CTR - RW / 2, CTR + RW / 2, CTR - RW / 2, CS],
       [CTR + RW / 2, CTR + RW / 2, CTR + RW / 2, CS],
       [0,            CTR - RW / 2, CTR - RW / 2, CTR - RW / 2],
       [CTR + RW / 2, CTR - RW / 2, CS,            CTR - RW / 2],
       [0,            CTR + RW / 2, CTR - RW / 2, CTR + RW / 2],
       [CTR + RW / 2, CTR + RW / 2, CS,            CTR + RW / 2],
      ].forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      });

      // Centre dashed lines
      dashLine(CTR, 0,            CTR, CTR - RW / 2);
      dashLine(CTR, CTR + RW / 2, CTR, CS);
      dashLine(0,            CTR, CTR - RW / 2, CTR);
      dashLine(CTR + RW / 2, CTR, CS,            CTR);

      // Lane dividers
      const laneDiv = RW / 4;
      ctx.strokeStyle = '#ffffff14';
      ctx.lineWidth = 1;
      ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.moveTo(CTR - laneDiv, 0);            ctx.lineTo(CTR - laneDiv, CTR - RW / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR - laneDiv, CTR + RW / 2); ctx.lineTo(CTR - laneDiv, CS);           ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR + laneDiv, 0);            ctx.lineTo(CTR + laneDiv, CTR - RW / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR + laneDiv, CTR + RW / 2); ctx.lineTo(CTR + laneDiv, CS);           ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,            CTR - laneDiv); ctx.lineTo(CTR - RW / 2, CTR - laneDiv); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR + RW / 2, CTR - laneDiv); ctx.lineTo(CS,            CTR - laneDiv); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,            CTR + laneDiv); ctx.lineTo(CTR - RW / 2, CTR + laneDiv); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR + RW / 2, CTR + laneDiv); ctx.lineTo(CS,            CTR + laneDiv); ctx.stroke();
      ctx.setLineDash([]);

      // Intersection box
      ctx.fillStyle = '#252d3e';
      ctx.fillRect(CTR - RW / 2, CTR - RW / 2, RW, RW);

      // Active lane glow
      const activeKey  = activeLaneKeyRef.current;
      const activeLane = lanesRef.current.find(l => l.lane_key === activeKey);
      if (activeLane) {
        const ap     = signalsRef.current[activeKey ?? ''] ?? 'red';
        const gcolor = ap === 'green' ? '#00e5aa' : ap === 'yellow' ? '#ffcc00' : '#ff3333';
        ctx.fillStyle = gcolor + '18';
        if (activeLane.lane === 'Lane A') ctx.fillRect(CTR - RW / 2, 0,            RW,           CTR - RW / 2);
        if (activeLane.lane === 'Lane B') ctx.fillRect(CTR + RW / 2, CTR - RW / 2, CTR - RW / 2, RW);
        if (activeLane.lane === 'Lane C') ctx.fillRect(CTR - RW / 2, CTR + RW / 2, RW,           CTR - RW / 2);
        if (activeLane.lane === 'Lane D') ctx.fillRect(0,            CTR - RW / 2, CTR - RW / 2, RW);
      }

      // Zebra crossings
      const zbW = RW, zbH = 14;
      zebra(CTR - RW / 2, CTR - RW / 2 - zbH - 2, zbW, zbH);
      zebra(CTR - RW / 2, CTR + RW / 2 + 2,        zbW, zbH);
      zebra(CTR - RW / 2 - zbH - 2, CTR - RW / 2,  zbH, zbW);
      zebra(CTR + RW / 2 + 2,       CTR - RW / 2,  zbH, zbW);

      // Stop lines
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(CTR - RW / 2, CTR - RW / 2 - 4); ctx.lineTo(CTR,        CTR - RW / 2 - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR,           CTR + RW / 2 + 4); ctx.lineTo(CTR + RW / 2, CTR + RW / 2 + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR + RW / 2 + 4, CTR - RW / 2); ctx.lineTo(CTR + RW / 2 + 4, CTR);          ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR - RW / 2 - 4, CTR);          ctx.lineTo(CTR - RW / 2 - 4, CTR + RW / 2); ctx.stroke();

      // Intersection centre markings
      ctx.strokeStyle = '#ffffff08';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(CTR - RW / 2, CTR); ctx.lineTo(CTR + RW / 2, CTR); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CTR, CTR - RW / 2); ctx.lineTo(CTR, CTR + RW / 2); ctx.stroke();

      // Traffic lights
      Object.entries(TLIGHT_POS).forEach(([laneName, pos]) => {
        const l  = lanesRef.current.find(x => x.lane === laneName);
        const ph: Phase = l ? (signalsRef.current[l.lane_key] ?? 'red') : 'red';
        drawLight(pos.x, pos.y, ph);
      });

      // Direction arrows
      ctx.fillStyle = '#ffffff12';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('↓', CTR - RW / 4, 40);
      ctx.fillText('↑', CTR + RW / 4, CS - 20);
      ctx.fillText('→', 30,           CTR + RW / 4);
      ctx.fillText('←', CS - 20,      CTR - RW / 4);

      // Lane name labels
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#ffffff40';
      ctx.textAlign = 'center';
      ctx.fillText('LANE A', CTR - RW / 4, 16);
      ctx.fillText('LANE C', CTR + RW / 4, CS - 6);
      ctx.textAlign = 'left';
      ctx.save(); ctx.translate(16, CTR + RW / 4); ctx.fillText('LANE D', 0, 0); ctx.restore();
      ctx.save(); ctx.translate(CS - 16, CTR - RW / 4); ctx.textAlign = 'right'; ctx.fillText('LANE B', 0, 0); ctx.restore();
      ctx.textAlign = 'left';

      // Vehicles
      spawnVehicles();
      moveVehicles();

      vehiclesRef.current.forEach(v => {
        const geo = vXY(v.lane, v.pos);
        if (!geo) return;
        const { x, y, w, h } = geo;
        ctx.fillStyle   = v.color;
        ctx.shadowBlur  = 8;
        ctx.shadowColor = v.color + 'aa';
        rrect(x, y, w, h, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff22';
        const isVert = h > w;
        if (isVert) { rrect(x+2, y+3, w-4, h*0.35, 2); ctx.fill(); }
        else        { rrect(x+3, y+2, w*0.35, h-4, 2); ctx.fill(); }
        ctx.fillStyle = '#ffffcccc';
        ctx.shadowBlur = 6; ctx.shadowColor = '#ffffcc';
        if (v.lane === 'Lane A') { ctx.fillRect(x+1, y+h-3, 3, 2); ctx.fillRect(x+w-4, y+h-3, 3, 2); }
        if (v.lane === 'Lane C') { ctx.fillRect(x+1, y, 3, 2);     ctx.fillRect(x+w-4, y, 3, 2); }
        if (v.lane === 'Lane B') { ctx.fillRect(x, y+1, 2, 3);     ctx.fillRect(x, y+h-4, 2, 3); }
        if (v.lane === 'Lane D') { ctx.fillRect(x+w-2, y+1, 2, 3); ctx.fillRect(x+w-2, y+h-4, 2, 3); }
        ctx.shadowBlur = 0;
      });

      // ── HUD overlay removed — info is shown in the right panel ──

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ── Derived UI ───────────────────────────────────────────────
  const noAnalysis     = !hasData;
  const totalVehicles  = lanes.reduce((a, l) => a + l.vehicle_count, 0);
  const totalCoordTime = lanes.reduce((a, l) => a + (l.coordinated_green ?? l.ai_green_time ?? 0), 0);
  const totalFuzzyTime = lanes.reduce((a, l) => a + (l.green_time ?? l.ai_green_time ?? 0), 0);
  const improvement    = totalCoordTime > 0
    ? (((CYCLE_TIME * lanes.length - totalCoordTime) / (CYCLE_TIME * lanes.length)) * 100).toFixed(1)
    : '---';
  const phColor = { green: 'text-emerald-400', yellow: 'text-amber-400', red: 'text-rose-400' }[phase];

  // ── Emergency scenario modal ─────────────────────────────────
  const ScenarioPanel = () => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) setShowScenarioPanel(false); }}
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}>

        {/* Modal header — never scrolls */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700/60 flex-shrink-0">
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert size={16} className="text-rose-400" /> Emergency Scenario Trigger
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Configure each entry separately — different lane, vehicle type, and scenario — then confirm all
            </p>
          </div>
          <button
            onClick={() => setShowScenarioPanel(false)}
            className="text-slate-500 hover:text-white text-xl leading-none transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800"
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 min-h-0 p-4 space-y-4"
          style={{ overflowY: 'auto', scrollBehavior: 'smooth' }}
        >

          {/* Step 1 — Vehicle type */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Step 1 — Vehicle Type
            </p>
            <div className="grid grid-cols-4 gap-2">
              {EMERGENCY_TYPES.map(vt => (
                <button key={vt.id}
                  onClick={() => { setSelectedVehicleType(vt); setSelectedScenario(vt.scenarios[0]); }}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-xl border text-[11px] font-bold transition-all',
                    selectedVehicleType.id === vt.id
                      ? `${vt.bgColor} ${vt.color} border-current`
                      : 'bg-slate-800/60 text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300'
                  )}
                >
                  <span className="text-2xl">{vt.icon}</span>
                  <span>{vt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — Scenario — FIXED smooth scroll */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Step 2 — Scenario{' '}
              <span className="text-slate-600 font-normal normal-case">({selectedVehicleType.label})</span>
            </p>
            {/* Smooth scrollable scenario list */}
            <div
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                scrollBehavior: 'smooth',
                overscrollBehavior: 'contain',
                paddingRight: '4px',
              }}
            >
              <div className="space-y-1.5">
                {selectedVehicleType.scenarios.map(sc => {
                  const sev        = SEVERITY_CONFIG[sc.severity];
                  const isSelected = selectedScenario.id === sc.id;
                  return (
                    <button key={sc.id} onClick={() => setSelectedScenario(sc)}
                      className={cn(
                        'w-full text-left p-3 rounded-xl border transition-all duration-150',
                        isSelected
                          ? `${sev.bg} border-current`
                          : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/60'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <span className="text-base">{sc.icon}</span>{sc.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full border', sev.bg, sev.color)}>
                            {sev.label}
                          </span>
                          <span className="text-[9px] text-slate-600">{sc.greenSecs}s</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{sc.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Step 3 — Lane */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Step 3 — Affected Lane
            </p>
            <div className="grid grid-cols-4 gap-2">
              {['Lane A', 'Lane B', 'Lane C', 'Lane D'].map(ln => {
                const isActive = selectedLane === ln;
                const isStaged = stagedEmergencies.some(e => e.lane === ln);
                const stagedEm = stagedEmergencies.find(e => e.lane === ln);
                return (
                  <button key={ln}
                    onClick={() => setSelectedLane(ln)}
                    className={cn(
                      'py-3 rounded-xl border text-xs font-bold transition-all relative',
                      isActive
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:border-slate-500'
                    )}
                    style={isActive ? {} : { borderColor: LANE_COLORS[ln] + '44', color: LANE_COLORS[ln] + 'aa' }}
                  >
                    {ln}
                    {isStaged && stagedEm && (
                      <span className="absolute -top-1.5 -right-1.5 text-sm"
                        title={`${stagedEm.vehicleType.label}: ${stagedEm.scenario.label}`}>
                        {stagedEm.vehicleType.icon}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add to queue summary row */}
          <div className={cn('p-3 rounded-xl border', SEVERITY_CONFIG[selectedScenario.severity].bg)}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white">
                  {selectedVehicleType.icon} {selectedVehicleType.label} · {selectedScenario.icon} {selectedScenario.label}
                  <span className="mx-2 text-slate-500">→</span>
                  <span style={{ color: LANE_COLORS[selectedLane] }}>{selectedLane}</span>
                </p>
                <p className={cn('text-[9px] font-bold mt-0.5', SEVERITY_CONFIG[selectedScenario.severity].color)}>
                  {SEVERITY_CONFIG[selectedScenario.severity].label} · {selectedScenario.greenSecs}s override
                  {(selectedScenario.severity === 'critical' || selectedScenario.severity === 'high') && ' · Immediate interrupt'}
                  {selectedScenario.severity === 'medium' && ' · Front of queue next cycle'}
                  {selectedScenario.severity === 'low'    && ' · Added first in next round'}
                </p>
              </div>
              <button
                onClick={addToStaged}
                className="flex-shrink-0 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition-all border border-slate-600"
              >
                + Add Entry
              </button>
            </div>
          </div>

          {/* Staged queue */}
          {stagedEmergencies.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Queued Entries ({stagedEmergencies.length}) — not yet active
              </p>
              <div className="space-y-1.5">
                {stagedEmergencies.map((entry, i) => {
                  const sev = SEVERITY_CONFIG[entry.scenario.severity];
                  return (
                    <div key={`${entry.lane}-${i}`}
                      className={cn('flex items-center gap-3 p-2.5 rounded-lg border', sev.bg)}
                    >
                      <span className="text-base flex-shrink-0">{entry.vehicleType.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-white">
                          {entry.vehicleType.label} · {entry.scenario.icon} {entry.scenario.label}
                          <span className="mx-1.5 text-slate-500">→</span>
                          <span style={{ color: LANE_COLORS[entry.lane] }}>{entry.lane}</span>
                        </p>
                        <p className={cn('text-[9px] font-bold', sev.color)}>
                          {sev.label} · {entry.scenario.greenSecs}s
                        </p>
                      </div>
                      <button
                        onClick={() => removeStagedEntry(entry.lane)}
                        className="flex-shrink-0 text-slate-500 hover:text-rose-400 text-sm font-bold transition-colors"
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="p-4 border-t border-slate-700/60 flex-shrink-0 flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-500">
            {stagedEmergencies.length === 0
              ? 'Add at least one entry to confirm'
              : `${stagedEmergencies.length} entr${stagedEmergencies.length > 1 ? 'ies' : 'y'} ready — decision engine will rank by severity`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setStagedEmergencies([]); setShowScenarioPanel(false); }}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs font-bold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={triggerScenarioEmergency}
              disabled={stagedEmergencies.length === 0}
              className={cn(
                'px-5 py-2 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                stagedEmergencies.some(e => e.scenario.severity === 'critical')
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : stagedEmergencies.some(e => e.scenario.severity === 'high')
                    ? 'bg-orange-600 hover:bg-orange-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
              )}
            >
              🚨 Confirm &amp; Trigger ({stagedEmergencies.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Active emergency banner ──────────────────────────────────
  const ActiveEmergencyBanner = () => {
    if (activeEmergencies.length === 0) return null;
    const sorted = [...activeEmergencies].sort((a, b) => b.rank - a.rank);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert size={11} /> {sorted.length} Active Emergency{sorted.length > 1 ? ' Scenarios' : ''}
          </p>
          {sorted.length > 1 && (
            <button onClick={clearAllEmergencies}
              className="text-[10px] text-slate-500 hover:text-rose-400 font-bold transition-colors">
              Clear All
            </button>
          )}
        </div>
        {sorted.map((em, idx) => {
          const sev     = SEVERITY_CONFIG[em.scenario.severity];
          const elapsed = Math.floor((Date.now() - em.triggeredAt) / 1000);
          const isTop   = idx === 0;
          return (
            <div key={`${em.lane}-${em.triggeredAt}`}
              className={cn(
                'p-3 rounded-xl border flex items-center justify-between gap-3',
                sev.bg,
                isTop && sev.pulse && 'animate-pulse'
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[9px] font-bold text-white">
                  {idx + 1}
                </div>
                <span className="text-xl flex-shrink-0">{em.vehicleType.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded border', sev.bg, sev.color)}>
                      {sev.label}
                    </span>
                    <span className="text-[11px] font-bold text-white">{em.vehicleType.label}</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] text-white">{em.scenario.icon} {em.scenario.label}</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] font-bold" style={{ color: LANE_COLORS[em.lane] }}>{em.lane}</span>
                    {isTop && (
                      <span className="text-[9px] font-bold text-rose-300 bg-rose-900/40 px-1.5 py-0.5 rounded">
                        ▲ HIGHEST PRIORITY
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-500 mt-0.5">
                    Rank: {em.rank} · Active {elapsed}s · {em.scenario.greenSecs}s override
                  </p>
                </div>
              </div>
              <button onClick={() => clearEmergencyForLane(em.lane)}
                className="flex-shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 text-[10px] font-bold transition-all">
                Clear
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-12">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border',
            connected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          )}>
            {connected
              ? <><Wifi size={12} className="animate-pulse" />Live Simulation</>
              : <><WifiOff size={12} />No Analysis Running</>}
          </div>
          {connected && <span className="text-[10px] text-slate-500">UPDATED: {lastUpdated}</span>}
          {emergencyLane && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-500/20 border border-rose-500/40 text-rose-400 animate-pulse">
              <ShieldAlert size={12} />Emergency — {emergencyLane}
            </div>
          )}
          <button
            onClick={() => setShowScenarioPanel(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
              showScenarioPanel || activeEmergencies.length > 0
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
            )}
          >
            <ShieldAlert size={12} />
            {activeEmergencies.length > 0
              ? `${activeEmergencies.map(e => e.vehicleType.icon).join('')} ${activeEmergencies.length} Active`
              : 'Emergency Scenario'}
          </button>
        </div>

        {/* Stats + speed */}
        <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
          <span>
            <Activity size={12} className="inline mr-1 text-emerald-500" />
            Vehicles: <strong className="text-white">{totalVehicles}</strong>
          </span>
          <span>
            <Zap size={12} className="inline mr-1 text-cyan-500" />
            Coord: <strong className="text-cyan-400">{totalCoordTime}s</strong>
          </span>
          <span>
            <Brain size={12} className="inline mr-1 text-blue-400" />
            Fuzzy: <strong className="text-emerald-400">{totalFuzzyTime}s</strong>
          </span>
          <span>
            <Clock size={12} className="inline mr-1 text-amber-500" />
            Trad: <span className="line-through text-slate-600">{CYCLE_TIME * (lanes.length || 4)}s</span>
          </span>
          <span className="text-emerald-400 font-bold">{improvement}% saved</span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider">Speed:</span>
            {[1, 2, 4].map(s => (
              <button key={s} onClick={() => setSimSpeed(s)}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-bold border transition-all',
                  simSpeed === s
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'
                )}
              >{s}×</button>
            ))}
          </div>
        </div>
      </div>

      {/* Emergency modal */}
      {showScenarioPanel && <ScenarioPanel />}

      {/* Active emergency banner */}
      <ActiveEmergencyBanner />

      {/* Canvas + right panel */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">

        {/* Canvas */}
        <div className="flex-shrink-0 space-y-2">
          <div className="relative rounded-xl overflow-hidden border border-brand-border shadow-2xl">
            <canvas ref={canvasRef} width={CS} height={CS} />
            {noAnalysis && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90">
                <Brain size={48} className="text-slate-700" />
                <p className="font-semibold text-slate-400">No Analysis Running</p>
                <p className="text-sm text-center max-w-xs text-slate-600 px-6">
                  Start an analysis on the Video Upload page first.
                </p>
              </div>
            )}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[10px] text-slate-500 justify-center px-2">
            {Object.entries(LANE_COLORS).map(([lane, color]) => (
              <span key={lane} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />{lane}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />GREEN</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />YELLOW</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />RED</span>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 space-y-3 min-w-0">
          {noAnalysis ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600 border border-brand-border rounded-xl">
              <p className="text-sm">Waiting for live data...</p>
            </div>
          ) : (<>

            {/* Active signal banner */}
            {activeLaneKey && (() => {
              const al = lanes.find(l => l.lane_key === activeLaneKey);
              if (!al) return null;
              const coordGt = al.coordinated_green ?? al.ai_green_time ?? 0;
              const fuzzyGt = al.green_time        ?? al.ai_green_time ?? 0;
              const score   = al.priority_score    ?? 0;
              return (
                <div className={cn(
                  'flex items-center justify-between px-4 py-3 rounded-xl border',
                  phase === 'green'  && 'bg-emerald-500/10 border-emerald-500/30',
                  phase === 'yellow' && 'bg-amber-500/10   border-amber-500/30',
                  phase === 'red'    && 'bg-slate-800/60   border-brand-border',
                )}>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Currently Active</p>
                    <p className="text-lg font-bold text-white">{al.lane}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      <Zap size={9} className="inline mr-1 text-cyan-400" />
                      Score: <span className={cn('font-bold',
                        score >= 60 ? 'text-rose-400' : score >= 30 ? 'text-amber-400' : 'text-emerald-400'
                      )}>{score.toFixed(0)}</span>
                      {' · '}
                      <Brain size={9} className="inline mr-1 text-blue-400" />
                      RF: <span className={cn('font-bold',
                        al.priority === 'High' ? 'text-rose-400' : al.priority === 'Medium' ? 'text-amber-400' : 'text-emerald-400'
                      )}>{al.priority} Priority</span>
                      {' · '}{al.vehicle_count} veh
                      {' · '}Coord:<span className="text-cyan-400 font-bold ml-1">{coordGt}s</span>
                      {' '}Fuzzy:<span className="text-emerald-400 font-bold ml-1">{fuzzyGt}s</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-[10px] uppercase font-bold tracking-widest', phColor)}>{phase}</p>
                    <p className={cn('text-4xl font-bold tabular-nums', phColor)}>{countdown}s</p>
                  </div>
                </div>
              );
            })()}

            {/* Lane cards */}
            <div className="grid grid-cols-2 gap-3">
              {lanes.map(lane => {
                const sig      = signalsRef.current[lane.lane_key] ?? 'red';
                const isActive = lane.lane_key === activeLaneKey;
                const coordGt  = lane.coordinated_green ?? lane.ai_green_time ?? 0;
                const fuzzyGt  = lane.green_time        ?? lane.ai_green_time ?? 0;
                const score    = lane.priority_score    ?? 0;
                return (
                  <div key={lane.lane_key} className={cn(
                    'p-3 rounded-xl border transition-all duration-500',
                    isActive && sig === 'green'  ? 'border-emerald-500/60 bg-emerald-500/5 shadow-[0_0_14px_rgba(0,212,170,0.1)]' :
                    isActive && sig === 'yellow' ? 'border-amber-500/60  bg-amber-500/5' :
                                                   'border-brand-border bg-slate-900/40'
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-0.5 p-1 bg-slate-800 rounded">
                          <div className={cn('w-2 h-2 rounded-full', sig === 'red'    ? 'bg-rose-500    shadow-[0_0_5px_#ff3333]' : 'bg-slate-700')} />
                          <div className={cn('w-2 h-2 rounded-full', sig === 'yellow' ? 'bg-amber-400   shadow-[0_0_5px_#ffcc00]' : 'bg-slate-700')} />
                          <div className={cn('w-2 h-2 rounded-full', sig === 'green'  ? 'bg-emerald-400 shadow-[0_0_5px_#00e5aa]' : 'bg-slate-700')} />
                        </div>
                        <span className="font-bold text-white text-sm">{lane.lane}</span>
                      </div>
                      <Badge variant={lane.priority === 'High' ? 'danger' : lane.priority === 'Medium' ? 'warning' : 'success'}>
                        {lane.priority}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-center mb-2">
                      {[
                        { label: 'Vehicles', value: lane.vehicle_count, color: 'text-white'       },
                        { label: 'Coord',    value: `${coordGt}s`,      color: 'text-cyan-400'    },
                        { label: 'Fuzzy',    value: `${fuzzyGt}s`,      color: 'text-emerald-400' },
                      ].map(s => (
                        <div key={s.label} className="bg-slate-800/60 rounded-lg py-1.5">
                          <p className="text-[8px] text-slate-500 uppercase">{s.label}</p>
                          <p className={cn('text-sm font-bold', s.color)}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Coordinated green bar */}
                    <div className="mb-1.5">
                      <div className="flex justify-between text-[8px] text-slate-600 mb-0.5">
                        <span className="flex items-center gap-1 text-cyan-600">
                          <Zap size={7} />Coordinated (inter-lane)
                        </span>
                        <span>{coordGt}s / {CYCLE_TIME}s</span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-700',
                            lane.congestion === 'High' ? 'bg-rose-500' : lane.congestion === 'Medium' ? 'bg-amber-400' : 'bg-cyan-500'
                          )}
                          style={{ width: `${(coordGt / CYCLE_TIME) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Fuzzy green bar */}
                    <div className="mb-1.5">
                      <div className="flex justify-between text-[8px] text-slate-600 mb-0.5">
                        <span className="flex items-center gap-1 text-emerald-700">
                          <Brain size={7} />Fuzzy (per-lane)
                        </span>
                        <span>{fuzzyGt}s / 60s</span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                          style={{ width: `${(fuzzyGt / 60) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Priority score bar */}
                    <div>
                      <div className="flex justify-between text-[8px] text-slate-600 mb-0.5">
                        <span>Priority Score</span>
                        <span className={cn('font-bold',
                          score >= 60 ? 'text-rose-400' : score >= 30 ? 'text-amber-400' : 'text-slate-500'
                        )}>{score.toFixed(0)} / 100</span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-700',
                            score >= 60 ? 'bg-rose-500' : score >= 30 ? 'bg-amber-400' : 'bg-slate-600'
                          )}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[8px] text-slate-700 mt-0.5">
                        <span>Density {(lane.density * 100).toFixed(1)}%</span>
                        <span>
                          {cycleQueueRef.current.includes(lane.lane_key)
                            ? `Queue: #${cycleQueueRef.current.indexOf(lane.lane_key) + 1}`
                            : lane.lane_key === activeLaneKey ? 'Active now' : 'Waiting'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Decision log */}
            {cycleLog.length > 0 && (
              <Card title="Signal Decision Log" subtitle="Score-based ordering · Fuzzy + Coordinated timing">
                <div className="mt-2 space-y-0.5 max-h-44 overflow-y-auto">
                  {cycleLog.map((entry, i) => (
                    <div key={i} className={cn(
                      'px-3 py-1.5 rounded text-[10px] font-mono flex items-start gap-2',
                      i === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-600'
                    )}>
                      <Brain size={8} className="mt-0.5 flex-shrink-0" />{entry}
                    </div>
                  ))}
                </div>
              </Card>
            )}

          </>)}
        </div>
      </div>
    </div>
  );
};
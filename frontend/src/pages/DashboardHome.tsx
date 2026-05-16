import React, { useState, useEffect } from 'react';
import {
  Car, Clock, AlertTriangle,
  ShieldAlert, Ambulance, Flame, ShieldCheck, Upload,
  Truck, Bus, Bike
} from 'lucide-react';
import { Card }            from '../components/Card';
import { Badge }           from '../components/Badge';
import { Button }          from '../components/Button';
import { cn }              from '../utils';
import { TrafficLightIcon } from '../components/TrafficLightIcon';

const FLASK_URL = 'http://127.0.0.1:5000';

// ── Types ──────────────────────────────────────────────────
interface VehicleTypes {
  Car:        number;
  Motorcycle: number;
  Bus:        number;
  Truck:      number;
}

interface LaneStats {
  lane:                  string;
  lane_key:              string;
  vehicle_count:         number;
  congestion:            string;
  green_time:            number;   // fuzzy per-lane green
  ai_green_time:         number;   // alias
  coordinated_green:     number;   // v4.5 inter-lane coordinated
  priority:              string;
  priority_score:        number;   // v4.5 continuous 0-100
  avg_speed:             number;
  density:               number;
  fps:                   number;
  frame:                 number;
  vehicle_types:         VehicleTypes;
  dominant_vehicle_type: string;
}

interface EmergencyAlert {
  id:        number;
  type:      string;
  lane:      string;
  action:    string;
  frame:     number;
  timestamp: string;
}

// ── Vehicle type display config ────────────────────────────
const VEHICLE_TYPE_CONFIG: Record<
  keyof VehicleTypes,
  { color: string; bg: string; icon: React.ReactNode; label: string }
> = {
  Car:        { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <Car size={12} />,  label: 'Cars'        },
  Motorcycle: { color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: <Bike size={12} />, label: 'Motorcycles' },
  Bus:        { color: 'text-blue-400',    bg: 'bg-blue-500/10',    icon: <Bus size={12} />,  label: 'Buses'       },
  Truck:      { color: 'text-orange-400',  bg: 'bg-orange-500/10',  icon: <Truck size={12} />,label: 'Trucks'      },
};

// ── Props ──────────────────────────────────────────────────
interface DashboardHomeProps {
  hasData:    boolean;
  onGoUpload: () => void;
}

// ── Component ──────────────────────────────────────────────
export const DashboardHome = ({ hasData, onGoUpload }: DashboardHomeProps) => {
  const [laneData,    setLaneData]    = useState<LaneStats[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyAlert[]>([]);
  const [status,      setStatus]      = useState<'CONNECTED' | 'OFFLINE'>('OFFLINE');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [hasEmergencyInLast5Min, setHasEmergencyInLast5Min] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // ── Aggregate vehicle type totals across all lanes ────────
  const vehicleTypeTotals: VehicleTypes = laneData.reduce(
    (acc, lane) => {
      const vt = lane.vehicle_types || { Car: 0, Motorcycle: 0, Bus: 0, Truck: 0 };
      return {
        Car:        acc.Car        + (vt.Car        || 0),
        Motorcycle: acc.Motorcycle + (vt.Motorcycle || 0),
        Bus:        acc.Bus        + (vt.Bus        || 0),
        Truck:      acc.Truck      + (vt.Truck      || 0),
      };
    },
    { Car: 0, Motorcycle: 0, Bus: 0, Truck: 0 }
  );

  const totalVehicleTypeCount = Object.values(vehicleTypeTotals).reduce((a, b) => a + b, 0);

  // ── Tick every second ─────────────────────────────────────
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  // ── Clear state when analysis stops ──────────────────────
  useEffect(() => {
    if (!hasData) {
      setLaneData([]);
      setEmergencies([]);
      setHasEmergencyInLast5Min(false);
    }
  }, [hasData]);

  // ── Poll live stats ───────────────────────────────────────
  useEffect(() => {
    if (!hasData) return;

    const fetchLiveStats = async () => {
      try {
        const res = await fetch(`${FLASK_URL}/api/live-stats`);
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            const active = json.data.filter((l: LaneStats) => l.frame > 0);
            setLaneData(active);
            if (active.length === 0) {
              setEmergencies([]);
              setHasEmergencyInLast5Min(false);
            }
          }
          setStatus('CONNECTED');
          setLastUpdated(new Date().toLocaleTimeString());
        } else {
          setStatus('OFFLINE');
        }
      } catch {
        setStatus('OFFLINE');
      }
    };

    fetchLiveStats();
    const interval = setInterval(fetchLiveStats, 3000);
    return () => clearInterval(interval);
  }, [hasData]);

  // ── Poll emergencies ──────────────────────────────────────
  useEffect(() => {
    if (!hasData || laneData.length === 0) return;

    const fetchEmergencies = async () => {
      try {
        const res = await fetch(`${FLASK_URL}/api/emergency`);
        if (res.ok) {
          const json = await res.json();
          const alerts: EmergencyAlert[] = json.data || [];
          setEmergencies(alerts);
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
          setHasEmergencyInLast5Min(alerts.some(e => new Date(e.timestamp) > fiveMinAgo));
        }
      } catch { /* ignore */ }
    };

    fetchEmergencies();
    const interval = setInterval(fetchEmergencies, 5000);
    return () => clearInterval(interval);
  }, [hasData, laneData.length]);

  // ── Computed metrics ──────────────────────────────────────
  const isLive = hasData && laneData.length > 0;

  const isLaneEmergencyActive = (laneName: string): boolean => {
    const thirtySecAgo = new Date(now - 30 * 1000);
    return emergencies.some(
      e => e.lane === laneName && new Date(e.timestamp) > thirtySecAgo
    );
  };

  const totalVehicles       = laneData.reduce((acc, l) => acc + (l.vehicle_count || 0), 0);
  const highCongestionCount = laneData.filter(l => l.congestion === 'High').length;
  const totalLanes          = laneData.length || 4;

  const avgDelay = isLive
    ? (laneData.reduce((acc, l) => acc + (60 - (l.ai_green_time || l.green_time || 0)), 0) / laneData.length).toFixed(1)
    : '---';

  const activeSignal = isLive
    ? [...laneData].sort((a, b) => (b.ai_green_time || b.green_time || 0) - (a.ai_green_time || a.green_time || 0))[0]?.lane || '---'
    : '---';

  const stats = [
    { label: 'Total Vehicles',   value: isLive ? totalVehicles.toLocaleString() : '---',           icon: <Car size={20} />,              trend: 'Live',     color: 'emerald' },
    { label: 'Avg Time Saved',   value: isLive ? `${avgDelay}s` : '---',                            icon: <Clock size={20} />,            trend: 'Saved',    color: 'cyan'    },
    { label: 'High Congestion',  value: isLive ? `${highCongestionCount}/${totalLanes} Lanes` : '---', icon: <AlertTriangle size={20} />, trend: 'Live',     color: highCongestionCount === 0 ? 'emerald' : highCongestionCount >= 2 ? 'rose' : 'amber' },
    { label: 'Active Signal',    value: activeSignal,                                                icon: <TrafficLightIcon size={20} />, trend: 'Priority', color: 'amber'   },
  ];

  const getEmergencyIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('ambulance')) return <Ambulance   size={18} className="text-rose-500"   />;
    if (t.includes('fire'))      return <Flame       size={18} className="text-orange-500" />;
    if (t.includes('police'))    return <ShieldAlert  size={18} className="text-blue-500"  />;
    return                              <ShieldAlert  size={18} className="text-slate-500" />;
  };

  // ── EMPTY STATE ───────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
          <span className="text-slate-600">● API IDLE</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <Card key={i} className="flex flex-col justify-between opacity-40">
              <div className="flex justify-between items-start">
                <div className="p-2 rounded-lg bg-slate-700/30 text-slate-600">{stat.icon}</div>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-600 mt-1">---</p>
              </div>
            </Card>
          ))}
        </div>
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
            <Upload size={36} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">No Analysis Running</h2>
          <p className="text-slate-400 max-w-sm mb-8">
            Upload traffic videos and run AI analysis to see live lane statistics, congestion status, and performance metrics here.
          </p>
          <Button onClick={onGoUpload} className="px-8">Go to Video Upload</Button>
        </Card>
      </div>
    );
  }

  // ── LIVE STATE ────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Status bar */}
      <div className="flex justify-between items-center">
        <Badge variant="success" className="animate-bounce">
          <ShieldCheck size={12} className="mr-1" /> Live Analysis Active
        </Badge>
        <div className="flex justify-end items-center gap-2 text-[10px] font-mono uppercase tracking-widest ml-auto">
          <span className={cn(status === 'CONNECTED' ? 'text-emerald-500' : 'text-rose-500')}>
            ● API {status}
          </span>
          {lastUpdated && (
            <span className="text-slate-500">LAST UPDATED: {lastUpdated}</span>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <Card key={i} className="flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div className={cn('p-2 rounded-lg', `bg-${stat.color}-500/10 text-${stat.color}-500`)}>
                {stat.icon}
              </div>
              <span className={cn(
                'text-xs font-bold',
                ['Saved', 'Live', 'Priority'].includes(stat.trend) ? 'text-emerald-500' : 'text-rose-500'
              )}>
                {stat.trend}
              </span>
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* ── v4.4: Vehicle Category Breakdown ─────────────────── */}
      {/* Shows live count of each vehicle type across ALL lanes  */}
      {isLive && (
        <Card title="Vehicle Category Breakdown" subtitle="Live classification across all lanes">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(Object.keys(VEHICLE_TYPE_CONFIG) as (keyof VehicleTypes)[]).map((vtype) => {
              const cfg       = VEHICLE_TYPE_CONFIG[vtype];
              const count     = vehicleTypeTotals[vtype] || 0;
              const pct       = totalVehicleTypeCount > 0
                                  ? Math.round((count / totalVehicleTypeCount) * 100)
                                  : 0;
              return (
                <div key={vtype} className="p-4 bg-slate-800/50 rounded-lg border border-brand-border">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn('p-1.5 rounded-md', cfg.bg, cfg.color)}>
                      {cfg.icon}
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {cfg.label}
                    </span>
                  </div>
                  <p className={cn('text-3xl font-bold', cfg.color)}>{count}</p>
                  {/* Percentage bar */}
                  <div className="mt-2">
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500',
                          vtype === 'Car'        ? 'bg-emerald-500' :
                          vtype === 'Motorcycle' ? 'bg-amber-500'   :
                          vtype === 'Bus'        ? 'bg-blue-500'    : 'bg-orange-500'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">{pct}% of traffic</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-lane vehicle type breakdown table */}
          {laneData.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-2 px-3 text-slate-500 font-bold uppercase tracking-wider">Lane</th>
                    {(Object.keys(VEHICLE_TYPE_CONFIG) as (keyof VehicleTypes)[]).map(vt => (
                      <th key={vt} className={cn('text-center py-2 px-3 font-bold uppercase tracking-wider', VEHICLE_TYPE_CONFIG[vt].color)}>
                        {vt}
                      </th>
                    ))}
                    <th className="text-center py-2 px-3 text-slate-500 font-bold uppercase tracking-wider">Dominant</th>
                  </tr>
                </thead>
                <tbody>
                  {laneData.map((lane) => {
                    const vt = lane.vehicle_types || { Car: 0, Motorcycle: 0, Bus: 0, Truck: 0 };
                    return (
                      <tr key={lane.lane} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 font-semibold text-white">{lane.lane}</td>
                        {(Object.keys(VEHICLE_TYPE_CONFIG) as (keyof VehicleTypes)[]).map(vtype => (
                          <td key={vtype} className={cn('text-center py-2 px-3 font-mono font-bold', VEHICLE_TYPE_CONFIG[vtype].color)}>
                            {vt[vtype] ?? 0}
                          </td>
                        ))}
                        <td className="text-center py-2 px-3">
                          <Badge variant="outline" className="text-[10px] border-slate-700">
                            {lane.dominant_vehicle_type || '—'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Lane Status + Emergency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Real-time Lane Status */}
        <Card
          title="Real-time Lane Status"
          subtitle="Live congestion monitoring across intersection"
          className="lg:col-span-2"
        >
          {laneData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-3">
                <Car size={24} className="text-slate-500" />
              </div>
              <p className="text-slate-400 font-medium">Waiting for detection...</p>
              <p className="text-slate-600 text-sm mt-1">YOLO is initialising, data will appear shortly</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {laneData.map((lane) => {
                const greenTime = lane.ai_green_time || lane.green_time || 0;
                const vt        = lane.vehicle_types || { Car: 0, Motorcycle: 0, Bus: 0, Truck: 0 };
                return (
                  <div key={lane.lane} className={cn(
                    "p-4 bg-slate-800/50 rounded-lg border transition-all duration-500",
                    isLaneEmergencyActive(lane.lane)
                      ? "border-rose-500/70 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                      : "border-brand-border"
                  )}>
                    {isLaneEmergencyActive(lane.lane) && (
                      <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-rose-500/20 border border-rose-500/50 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Emergency Detected — Priority Override</span>
                      </div>
                    )}

                    {/* Lane header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full animate-pulse",
                          isLaneEmergencyActive(lane.lane) ? "bg-rose-500" : "bg-emerald-500"
                        )} />
                        <h4 className="font-bold text-white">{lane.lane}</h4>
                      </div>
                      <Badge variant={lane.congestion === 'High' ? 'danger' : lane.congestion === 'Medium' ? 'warning' : 'success'}>
                        {lane.congestion.toUpperCase()}
                      </Badge>
                    </div>

                    {/* Core stats */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Vehicles</p>
                        <div className="flex items-center gap-1.5 text-white font-bold">
                          <Car size={14} className="text-emerald-500" /> {lane.vehicle_count}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Avg Speed</p>
                        <p className="text-white font-bold">
                          {lane.avg_speed}
                          <span className="text-[10px] font-normal text-slate-500 ml-1">KM/H</span>
                        </p>
                      </div>
                    </div>

                    {/* Vehicle type mini-badges */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(Object.keys(VEHICLE_TYPE_CONFIG) as (keyof VehicleTypes)[]).map((vtype) => {
                        const count = vt[vtype] ?? 0;
                        if (count === 0) return null;
                        const cfg = VEHICLE_TYPE_CONFIG[vtype];
                        return (
                          <span key={vtype} className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold', cfg.bg, cfg.color)}>
                            {cfg.icon}{vtype}: {count}
                          </span>
                        );
                      })}
                    </div>

                    {/* AI vs Traditional green time */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-emerald-400">AI Green: {greenTime}s</span>
                        <span className="text-slate-500">TRAD: 60s</span>
                      </div>
                      <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${(greenTime / 60) * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-right text-emerald-400 font-bold">
                        {greenTime > 0 ? `${((60 - greenTime) / 60 * 100).toFixed(1)}% IMPROVEMENT` : ''}
                      </p>
                    </div>

                    {/* Footer */}
                    <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-between items-center">
                      <Badge variant="outline" className="text-[10px] border-slate-700">
                        PRIORITY: {(lane.priority || 'LOW').toUpperCase()}
                      </Badge>
                      <span className="text-[10px] text-slate-600 font-mono">
                        {lane.fps > 0 ? `${lane.fps} FPS` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Emergency Alerts */}
        <Card
          title="Emergency Alerts"
          subtitle="Live session detections only"
          className={cn(
            'flex flex-col transition-all duration-500',
            hasEmergencyInLast5Min && 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.2)]'
          )}
        >
          <div className="flex-1 space-y-4 overflow-y-auto max-h-[400px] pr-2">
            {emergencies.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 text-emerald-500">
                  <ShieldCheck size={32} />
                </div>
                <h4 className="text-white font-semibold">All Systems Normal</h4>
                <p className="text-sm text-slate-500 mt-2">No emergency vehicles detected this session.</p>
              </div>
            ) : (
              emergencies.map((alert) => (
                <div
                  key={`${alert.id}-${alert.timestamp}`}
                  className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-brand-border"
                >
                  <div className="p-2 bg-slate-900 rounded-lg">
                    {getEmergencyIcon(alert.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white uppercase">{alert.type}</p>
                    <p className="text-xs text-slate-500">
                      {alert.lane} · {new Date(alert.timestamp).toLocaleTimeString()}
                    </p>
                    {alert.action && (
                      <p className="text-[10px] text-rose-400 font-bold mt-0.5">{alert.action}</p>
                    )}
                  </div>
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                </div>
              ))
            )}
          </div>
          <Button variant="outline" className="w-full mt-4">View History</Button>
        </Card>
      </div>

    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { Shield, Clock, CheckCircle2, XCircle, RefreshCw, Activity, Zap, Eye } from 'lucide-react';

const FLASK_URL = 'http://127.0.0.1:5000';

interface Stats {
  total_today: number;
  pending:     number;
  reviewed:    number;
  dismissed:   number;
  total:       number;
}

const StatCard = ({
  icon, label, value, sub, color
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color: string;
}) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
    <div className="flex items-center justify-between mb-3">
      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{label}</p>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
    </div>
    <p className="text-3xl font-bold text-white">{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
  </div>
);

export const AdminOverview = () => {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res  = await fetch(`${FLASK_URL}/api/complaints/stats`);
      const json = await res.json();
      setStats(json);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Traffic violation complaints at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Shield size={18} className="text-rose-400" />}
          label="Complaints Today"
          value={loading ? '—' : (stats?.total_today ?? 0)}
          sub="Detected violations"
          color="bg-rose-500/10"
        />
        <StatCard
          icon={<Clock size={18} className="text-amber-400" />}
          label="Pending Review"
          value={loading ? '—' : (stats?.pending ?? 0)}
          sub="Awaiting admin action"
          color="bg-amber-500/10"
        />
        <StatCard
          icon={<CheckCircle2 size={18} className="text-emerald-400" />}
          label="Approved"
          value={loading ? '—' : (stats?.reviewed ?? 0)}
          sub="Confirmed violations"
          color="bg-emerald-500/10"
        />
        <StatCard
          icon={<XCircle size={18} className="text-slate-400" />}
          label="Dismissed"
          value={loading ? '—' : (stats?.dismissed ?? 0)}
          sub="Cleared by admin"
          color="bg-slate-500/10"
        />
      </div>

      {/* Info panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* How violations are detected */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-emerald-400" />
            <h3 className="text-white font-semibold">How Violations Are Detected</h3>
          </div>
          <ul className="space-y-3">
            {[
              { icon: <Eye size={13} />,    text: 'YOLO v8 detects and tracks vehicles per lane in real-time' },
              { icon: <Zap size={13} />,    text: 'Signal controller marks each lane as red, yellow or green' },
              { icon: <Shield size={13} />, text: 'Red Light — vehicle speed ≥ 30 km/h on red signal for 5s' },
              { icon: <Shield size={13} />, text: 'Speeding — vehicle speed ≥ 80 km/h on any signal state' },
              { icon: <Shield size={13} />, text: 'Overloaded — Bus/Truck width exceeds 40% of frame width' },
              { icon: <Eye size={13} />,    text: 'EasyOCR reads plate number from bottom of vehicle bounding box' },
              { icon: <Zap size={13} />,    text: 'Snapshot + complaint auto-sent here — UNKNOWN plates are skipped' },
            ].map(({ icon, text }, i) => (
              <li key={i} className="flex items-start gap-2.5 text-slate-400 text-sm">
                <span className="text-emerald-400 mt-0.5 shrink-0">{icon}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Summary */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Complaint Summary</h3>
            <button
              onClick={fetchStats}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 hover:text-white text-xs transition-colors"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          <div className="space-y-3 mb-6">
            {[
              { label: 'Total complaints', value: stats?.total     ?? 0, color: 'text-white',        bg: 'bg-slate-700' },
              { label: 'Pending review',   value: stats?.pending   ?? 0, color: 'text-amber-400',    bg: 'bg-amber-500' },
              { label: 'Approved',         value: stats?.reviewed  ?? 0, color: 'text-emerald-400',  bg: 'bg-emerald-500' },
              { label: 'Dismissed',        value: stats?.dismissed ?? 0, color: 'text-slate-400',    bg: 'bg-slate-500' },
            ].map(({ label, value, color, bg }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-400 text-sm">{label}</span>
                  <span className={`font-bold text-sm ${color}`}>{loading ? '—' : value}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${bg} rounded-full transition-all duration-700`}
                    style={{
                      width: !loading && stats?.total
                        ? `${Math.round((value / stats.total) * 100)}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Last updated */}
          <p className="text-slate-600 text-xs text-right">
            Auto-refreshes every 15s
          </p>
        </div>
      </div>
    </div>
  );
};
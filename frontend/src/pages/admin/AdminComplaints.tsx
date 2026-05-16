import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, CheckCircle2, XCircle,
  Clock, Eye, RefreshCw, X, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatId } from '../../utils/formatId';

interface Complaint {
  id:             number;
  plate_number:   string;
  vehicle_type:   string;
  lane:           string;
  violation_type: string;
  snapshot_url:   string;
  timestamp:      string;
  status:         'pending' | 'reviewed' | 'dismissed';
  admin_notes:    string | null;
}

const FLASK_URL = 'http://127.0.0.1:5000';

// ── Status Badge ───────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    pending:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    reviewed:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dismissed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };
  const icons: Record<string, React.ReactNode> = {
    pending:   <Clock size={11} />,
    reviewed:  <CheckCircle2 size={11} />,
    dismissed: <XCircle size={11} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${styles[status] ?? styles.pending}`}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// ── Confirm Dialog ─────────────────────────────────────────
const ConfirmDialog = ({
  message, onConfirm, onCancel
}: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative bg-[#0f1724] border border-slate-700 rounded-2xl p-6 w-full max-w-sm z-10 shadow-2xl"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-rose-500/10 rounded-full flex items-center justify-center">
          <Trash2 size={18} className="text-rose-400" />
        </div>
        <div>
          <p className="text-white font-semibold">Confirm Delete</p>
          <p className="text-slate-400 text-sm">{message}</p>
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors"
        >
          Delete All
        </button>
      </div>
    </motion.div>
  </div>
);

// ── Review Modal ───────────────────────────────────────────
const ReviewModal = ({
  complaint, onClose, onUpdate,
}: {
  complaint: Complaint;
  onClose:   () => void;
  onUpdate:  (id: number, status: string, notes: string) => Promise<void>;
}) => {
  const [notes,   setNotes]   = useState(complaint.admin_notes || '');
  const [loading, setLoading] = useState(false);

  const handleAction = async (status: 'reviewed' | 'dismissed') => {
    setLoading(true);
    await onUpdate(complaint.id, status, notes);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-[#0f1724] border border-slate-700 rounded-2xl overflow-hidden shadow-2xl z-10"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-rose-500/10 rounded-lg flex items-center justify-center">
              <Shield size={18} className="text-rose-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Complaint {formatId('CP', complaint.id)}</h3>
              <p className="text-slate-500 text-xs">{new Date(complaint.timestamp).toLocaleString()}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Snapshot */}
          <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800 aspect-video flex items-center justify-center">
            {complaint.snapshot_url ? (
              <img
                src={complaint.snapshot_url}
                alt="Violation snapshot"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-600">
                <Eye size={32} />
                <p className="text-sm">No snapshot available</p>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Plate Number',   value: complaint.plate_number   || '—' },
              { label: 'Vehicle Type',   value: complaint.vehicle_type   || '—' },
              { label: 'Lane',           value: complaint.lane           || '—' },
              { label: 'Violation Type', value: complaint.violation_type || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-900 rounded-lg p-3 border border-slate-800">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-1">{label}</p>
                <p className="text-white font-semibold text-sm">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <p className="text-slate-500 text-xs">Current status:</p>
            <StatusBadge status={complaint.status} />
          </div>

          <div>
            <label className="block text-slate-500 text-xs uppercase tracking-wider font-semibold mb-2">
              Admin Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes about this complaint..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => handleAction('reviewed')}
              disabled={loading || complaint.status === 'reviewed'}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
            >
              <CheckCircle2 size={16} />
              {loading ? 'Saving...' : 'Approve Complaint'}
            </button>
            <button
              onClick={() => handleAction('dismissed')}
              disabled={loading || complaint.status === 'dismissed'}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
            >
              <XCircle size={16} />
              {loading ? 'Saving...' : 'Dismiss'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────
export const AdminComplaints = () => {
  const [complaints,   setComplaints]   = useState<Complaint[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState<'all' | 'pending' | 'reviewed' | 'dismissed'>('all');
  const [laneFilter,   setLaneFilter]   = useState('all');
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState<Complaint | null>(null);
  const [lastRefresh,  setLastRefresh]  = useState(new Date());
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [clearing,     setClearing]     = useState(false);

  const fetchComplaints = useCallback(async () => {
    try {
      const url  = filter === 'all'
        ? `${FLASK_URL}/api/complaints`
        : `${FLASK_URL}/api/complaints?status=${filter}`;
      const res  = await fetch(url);
      const json = await res.json();
      setComplaints(json.data || []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to fetch complaints:', e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchComplaints();
    const interval = setInterval(fetchComplaints, 10_000);
    return () => clearInterval(interval);
  }, [fetchComplaints]);

  const handleUpdate = async (id: number, status: string, notes: string) => {
    try {
      await fetch(`${FLASK_URL}/api/complaints/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status, admin_notes: notes }),
      });
      setComplaints(prev =>
        prev.map(c => c.id === id ? { ...c, status: status as any, admin_notes: notes } : c)
      );
    } catch (e) {
      console.error('Update failed:', e);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await fetch(`${FLASK_URL}/api/complaints/clear-all`, { method: 'DELETE' });
      setComplaints([]);
    } catch (e) {
      console.error('Clear failed:', e);
    } finally {
      setClearing(false);
      setShowConfirm(false);
    }
  };

  const lanes    = ['all', ...Array.from(new Set(complaints.map(c => c.lane).filter(Boolean)))];
  const filtered = complaints.filter(c => {
    const matchLane   = laneFilter === 'all' || c.lane === laneFilter;
    const matchSearch = !search ||
      c.plate_number?.toLowerCase().includes(search.toLowerCase()) ||
      c.vehicle_type?.toLowerCase().includes(search.toLowerCase());
    return matchLane && matchSearch;
  });

  const counts = {
    all:       complaints.length,
    pending:   complaints.filter(c => c.status === 'pending').length,
    reviewed:  complaints.filter(c => c.status === 'reviewed').length,
    dismissed: complaints.filter(c => c.status === 'dismissed').length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Complaints Management</h1>
          <p className="text-slate-400 text-sm mt-1">
            Auto-detected red light violations (≥30 km/h on red) · auto-refreshes every 10s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchComplaints}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-sm transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={complaints.length === 0 || clearing}
            className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-400 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} /> Clear All
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'reviewed', 'dismissed'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
              filter === s
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="ml-1.5 text-xs opacity-60">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Search + lane */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search plate or vehicle type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
        <select
          value={laneFilter}
          onChange={(e) => setLaneFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 text-sm focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          {lanes.map(l => (
            <option key={l} value={l}>{l === 'all' ? 'All Lanes' : l}</option>
          ))}
        </select>
      </div>

      <p className="text-slate-600 text-xs">Last updated: {lastRefresh.toLocaleTimeString()}</p>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Loading complaints...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center">
              <Shield size={24} className="text-slate-600" />
            </div>
            <p className="text-slate-400 font-medium">No complaints found</p>
            <p className="text-slate-600 text-sm">
              {filter !== 'all' ? `No ${filter} complaints yet` : 'System monitoring for violations ≥30 km/h'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {['ID', 'Plate', 'Type', 'Lane', 'Violation', 'Time', 'Status', 'Action'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-500 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(c => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-emerald-400 text-xs font-mono font-bold">{formatId('CP', c.id)}</td>
                    <td className="px-4 py-3">
                      <span className="text-white font-bold font-mono text-sm bg-slate-800 px-2 py-0.5 rounded">
                        {c.plate_number || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{c.vehicle_type || '—'}</td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{c.lane || '—'}</td>
                    <td className="px-4 py-3 text-rose-400 text-xs font-medium">{c.violation_type}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(c.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-xs font-medium transition-colors"
                      >
                        <Eye size={12} /> Review
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showConfirm && (
          <ConfirmDialog
            message={`This will permanently delete all ${complaints.length} complaints.`}
            onConfirm={handleClearAll}
            onCancel={() => setShowConfirm(false)}
          />
        )}
        {selected && (
          <ReviewModal
            complaint={selected}
            onClose={() => setSelected(null)}
            onUpdate={handleUpdate}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
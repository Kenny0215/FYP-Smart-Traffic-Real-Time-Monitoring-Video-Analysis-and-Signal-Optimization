import React, { useState, useEffect, useCallback } from 'react';
import {
  Star, MessageSquare, RefreshCw, Trash2,
  TrendingUp, X, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { formatId } from '../../utils/formatId';

// ── Types ──────────────────────────────────────────────────
interface Feedback {
  id:         number;
  user_id:    string | null;
  rating:     number;
  quality:    string;
  comments:   string;
  created_at: string;
}

// ── Star display ───────────────────────────────────────────
const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map(s => (
      <Star
        key={s}
        size={14}
        className={s <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}
      />
    ))}
  </div>
);

// ── Quality badge — color based on rating not text ────────
const QualityBadge = ({ quality, rating }: { quality: string; rating: number }) => {
  const style =
    rating >= 4 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
    rating === 3 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'      :
                   'bg-rose-500/15 text-rose-400 border-rose-500/30';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${style}`}>
      {quality}
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

// ── Main ───────────────────────────────────────────────────
export const AdminFeedback = () => {
  const [feedback,    setFeedback]    = useState<Feedback[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [ratingFilter,setRatingFilter]= useState<number | 'all'>('all');
  const [showConfirm, setShowConfirm] = useState(false);
  const [clearing,    setClearing]    = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [expanded,    setExpanded]    = useState<number | null>(null);

  const fetchFeedback = useCallback(async () => {
    try {
      let query = supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setFeedback(data || []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to fetch feedback:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedback();
    const interval = setInterval(fetchFeedback, 15_000);
    return () => clearInterval(interval);
  }, [fetchFeedback]);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await supabase.from('feedback').delete().gt('id', 0);
      setFeedback([]);
    } catch (e) {
      console.error('Clear failed:', e);
    } finally {
      setClearing(false);
      setShowConfirm(false);
    }
  };

  // ── Stats ──────────────────────────────────────────────
  const avgRating = feedback.length
    ? (feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length).toFixed(1)
    : '—';

  const ratingCounts = [5, 4, 3, 2, 1].map(r => ({
    star:  r,
    count: feedback.filter(f => f.rating === r).length,
    pct:   feedback.length
      ? Math.round((feedback.filter(f => f.rating === r).length / feedback.length) * 100)
      : 0,
  }));

  const qualityCounts = [
    'Excellent - Highly Accurate',
    'Good - Minor Discrepancies',
    'Average - Needs Improvement',
    'Poor - Inaccurate Detections',
  ].map(q => ({
    label: q,
    count: feedback.filter(f => f.quality === q).length,
  }));

  // ── Filter ─────────────────────────────────────────────
  const filtered = ratingFilter === 'all'
    ? feedback
    : feedback.filter(f => f.rating === ratingFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Feedback</h1>
          <p className="text-slate-400 text-sm mt-1">
            System accuracy feedback from users · auto-refreshes every 15s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFeedback}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-sm transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={feedback.length === 0 || clearing}
            className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-400 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} /> Clear All
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Average rating */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-2">Average Rating</p>
          <div className="flex items-end gap-3">
            <p className="text-4xl font-bold text-white">{avgRating}</p>
            <div className="mb-1">
              <StarRating rating={Math.round(Number(avgRating))} />
              <p className="text-slate-500 text-xs mt-1">{feedback.length} response{feedback.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Rating breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-3">Rating Breakdown</p>
          <div className="space-y-1.5">
            {ratingCounts.map(({ star, count, pct }) => (
              <div key={star} className="flex items-center gap-2">
                <span className="text-slate-400 text-xs w-4">{star}</span>
                <Star size={11} className="fill-amber-400 text-amber-400 shrink-0" />
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-slate-500 text-xs w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quality breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-3">Quality Distribution</p>
          <div className="space-y-2">
            {qualityCounts.map(({ label, count }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-slate-400 text-xs truncate flex-1">
                  {label.split(' - ')[0]}
                </span>
                <span className="text-white text-xs font-bold shrink-0">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500 text-xs">Filter by rating:</span>
        <button
          onClick={() => setRatingFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            ratingFilter === 'all'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600'
          }`}
        >
          All <span className="ml-1 opacity-60">{feedback.length}</span>
        </button>
        {[5, 4, 3, 2, 1].map(r => (
          <button
            key={r}
            onClick={() => setRatingFilter(r)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              ratingFilter === r
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600'
            }`}
          >
            {r} <Star size={10} className="fill-current" />
            <span className="opacity-60">{feedback.filter(f => f.rating === r).length}</span>
          </button>
        ))}
      </div>

      <p className="text-slate-600 text-xs">Last updated: {lastRefresh.toLocaleTimeString()}</p>

      {/* Feedback list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Loading feedback...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center">
              <MessageSquare size={24} className="text-slate-600" />
            </div>
            <p className="text-slate-400 font-medium">No feedback yet</p>
            <p className="text-slate-600 text-sm">Users haven't submitted any feedback</p>
          </div>
        ) : (
          filtered.map(f => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
            >
              {/* Row */}
              <div className="flex items-center gap-4 px-5 py-4">
                {/* ID */}
                <span className="text-slate-500 text-xs font-mono font-bold shrink-0">
                  {formatId('FD', f.id)}
                </span>
                {/* Rating */}
                <div className="shrink-0">
                  <StarRating rating={f.rating} />
                </div>

                {/* Quality */}
                <div className="shrink-0 hidden sm:block">
                  <QualityBadge quality={f.quality} rating={f.rating} />
                </div>

                {/* Comment preview */}
                <div className="flex-1 min-w-0">
                  {f.comments ? (
                    <p className="text-slate-300 text-sm truncate">{f.comments}</p>
                  ) : (
                    <p className="text-slate-600 text-sm italic">No comments</p>
                  )}
                </div>

                {/* Date */}
                <p className="text-slate-500 text-xs shrink-0 hidden md:block">
                  {new Date(f.created_at).toLocaleDateString()}
                </p>

                {/* Expand toggle */}
                {f.comments && (
                  <button
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                    className="shrink-0 text-slate-500 hover:text-white transition-colors"
                  >
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${expanded === f.id ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </div>

              {/* Expanded comment */}
              <AnimatePresence>
                {expanded === f.id && f.comments && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 pt-0 border-t border-slate-800">
                      <div className="sm:hidden mb-3">
                        <QualityBadge quality={f.quality} rating={f.rating} />
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed">{f.comments}</p>
                      <p className="text-slate-500 text-xs mt-2">
                        Submitted: {new Date(f.created_at).toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))
        )}
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {showConfirm && (
          <ConfirmDialog
            message={`This will permanently delete all ${feedback.length} feedback entries.`}
            onConfirm={handleClearAll}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
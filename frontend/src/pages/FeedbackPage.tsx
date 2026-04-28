import React, { useState } from 'react';
import { Star, Activity, MessageSquare, CheckCircle } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { cn } from '../utils';
import { supabase } from '../lib/supabase';

export const FeedbackPage = () => {
  const [rating,   setRating]   = useState(0);
  const [hover,    setHover]    = useState(0);
  const [quality,  setQuality]  = useState('Excellent - Highly Accurate');
  const [comments, setComments] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }

    setLoading(true);
    try {
      // Get current logged in user
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('feedback').insert({
        user_id:  user?.id ?? null,
        rating,
        quality,
        comments,
        created_at: new Date().toISOString()
      });

      if (error) throw error;

      setSuccess(true);
      setRating(0);
      setQuality('Excellent - Highly Accurate');
      setComments('');

    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card title="System Feedback" subtitle="Help us improve the traffic management accuracy">

        {/* Success message */}
        {success && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-500" />
            <div>
              <p className="text-emerald-400 font-medium">Feedback submitted!</p>
              <p className="text-slate-400 text-sm">Thank you for helping us improve.</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form className="space-y-6 mt-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Rate System Accuracy
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(star)}
                  className="transition-all duration-200 transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    size={32}
                    className={cn(
                      "transition-colors duration-200",
                      (hover || rating) >= star
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-600"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Activity size={16} className="text-emerald-500" />
              Traffic Analysis Quality
            </label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full bg-slate-800 border border-brand-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              <option>Excellent - Highly Accurate</option>
              <option>Good - Minor Discrepancies</option>
              <option>Average - Needs Improvement</option>
              <option>Poor - Inaccurate Detections</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <MessageSquare size={16} className="text-emerald-500" />
              Additional Comments
            </label>
            <textarea
              rows={4}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full bg-slate-800 border border-brand-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              placeholder="Share your experience or report issues..."
            />
          </div>

          <Button className="w-full py-4" type="submit" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </form>
      </Card>
    </div>
  );
};
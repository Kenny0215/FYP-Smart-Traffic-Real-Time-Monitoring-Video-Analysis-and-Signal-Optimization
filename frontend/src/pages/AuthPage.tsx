import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '../components/Button';
import { TrafficLightIcon } from '../components/TrafficLightIcon';
import { supabase } from '../lib/supabase';

export const AuthPage = ({
  onAuth, onBack,
}: {
  onAuth: (name: string, role: 'user' | 'admin') => void,
  onBack: () => void,
}) => {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Step 1 — Check admins table first
      const { data: admin } = await supabase
        .from('admins')
        .select('id, full_name, email')
        .eq('email', email.trim().toLowerCase())
        .eq('password', password)
        .maybeSingle();

      if (admin) {
        onAuth(admin.full_name || admin.email, 'admin');
        return;
      }

      // Step 2 — Check users table
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('email', email.trim().toLowerCase())
        .eq('password', password)
        .maybeSingle();

      if (userError) throw new Error(userError.message);
      if (!user)     throw new Error('Invalid email or password.');

      onAuth(user.full_name || user.email, 'user');

    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <button
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
      >
        <div className="w-8 h-8 rounded-full border border-brand-border flex items-center justify-center group-hover:border-emerald-500 transition-colors">
          <ArrowLeft size={16} />
        </div>
        <span className="text-sm font-medium">Back to Landing</span>
      </button>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass-panel p-8"
      >
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <TrafficLightIcon className="text-white" size={28} colorized />
          </div>
          <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
          <p className="text-slate-400 text-sm mt-2">
            Sign in to the Traffic Control Center
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-800 border border-brand-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="user@gmail.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-brand-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <Button className="w-full py-3 mt-6" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : 'Sign In'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Don't have an account? Contact your administrator.
        </p>
      </motion.div>
    </div>
  );
};
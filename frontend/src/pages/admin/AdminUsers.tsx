import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Trash2, RefreshCw,
  Eye, EyeOff, X, Shield, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { formatId } from '../../utils/formatId';

interface UserRow {
  id:         number;
  full_name:  string;
  email:      string;
  password:   string;
  created_at: string;
}

interface AdminRow {
  id:         number;
  full_name:  string;
  email:      string;
  password:   string;
  created_at: string;
}

// ── Add User Modal ─────────────────────────────────────────
const AddUserModal = ({
  tableTarget, onClose, onSuccess
}: {
  tableTarget: 'users' | 'admins';
  onClose:     () => void;
  onSuccess:   () => void;
}) => {
  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Check duplicate email in both tables
      const { data: existUser }  = await supabase.from('users').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
      const { data: existAdmin } = await supabase.from('admins').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
      if (existUser || existAdmin) throw new Error('Email already exists.');

      const { error: insertError } = await supabase.from(tableTarget).insert({
        full_name: fullName.trim(),
        email:     email.trim().toLowerCase(),
        password:  password,
      });
      if (insertError) throw new Error(insertError.message);

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md bg-[#0f1724] border border-slate-700 rounded-2xl p-6 z-10 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tableTarget === 'admins' ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
              {tableTarget === 'admins'
                ? <Shield size={18} className="text-emerald-400" />
                : <User size={18} className="text-blue-400" />
              }
            </div>
            <h3 className="text-white font-semibold">
              Register New {tableTarget === 'admins' ? 'Admin' : 'User'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
            <input
              type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="user@gmail.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-700 rounded-lg text-slate-300 text-sm hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// ── User Table ─────────────────────────────────────────────
const UserTable = ({
  title, icon, data, loading, onDelete, color
}: {
  title:   string;
  icon:    React.ReactNode;
  data:    (UserRow | AdminRow)[];
  loading: boolean;
  onDelete:(id: number, table: 'users' | 'admins') => void;
  color:   string;
  table:   'users' | 'admins';
}) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      <h3 className="text-white font-semibold">{title}</h3>
      <span className="ml-auto text-slate-500 text-sm">{data.length} account{data.length !== 1 ? 's' : ''}</span>
    </div>
    {loading ? (
      <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
        <RefreshCw size={14} className="animate-spin" /> <span className="text-sm">Loading...</span>
      </div>
    ) : data.length === 0 ? (
      <div className="py-10 text-center text-slate-600 text-sm">No accounts yet</div>
    ) : (
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-800">
            {['ID', 'Name', 'Email', 'Password', 'Created', 'Action'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {data.map(row => (
            <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3 text-emerald-400 text-xs font-mono font-bold">
                {formatId(title.toLowerCase().includes('admin') ? 'AD' : 'US', row.id)}
              </td>
              <td className="px-4 py-3 text-white text-sm font-medium">{row.full_name}</td>
              <td className="px-4 py-3 text-slate-300 text-sm">{row.email}</td>
              <td className="px-4 py-3 text-slate-400 text-sm font-mono">{row.password}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">{new Date(row.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onDelete(row.id, title.toLowerCase().includes('admin') ? 'admins' : 'users')}
                  className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

// ── Main ───────────────────────────────────────────────────
export const AdminUsers = () => {
  const [users,     setUsers]     = useState<UserRow[]>([]);
  const [admins,    setAdmins]    = useState<AdminRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState<'users' | 'admins' | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, adminsRes] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase.from('admins').select('*').order('created_at', { ascending: false }),
      ]);
      setUsers(usersRes.data  || []);
      setAdmins(adminsRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (id: number, table: 'users' | 'admins') => {
    if (!confirm('Delete this account?')) return;
    await supabase.from(table).delete().eq('id', id);
    fetchAll();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage user and admin accounts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-sm transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowModal('users')}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm transition-colors">
            <UserPlus size={14} /> Add User
          </button>
          <button onClick={() => setShowModal('admins')}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm transition-colors">
            <Shield size={14} /> Add Admin
          </button>
        </div>
      </div>

      {/* Tables */}
      <UserTable
        title="Users"
        table="users"
        icon={<User size={16} className="text-blue-400" />}
        color="bg-blue-500/10"
        data={users}
        loading={loading}
        onDelete={handleDelete}
      />
      <UserTable
        title="Admins"
        table="admins"
        icon={<Shield size={16} className="text-emerald-400" />}
        color="bg-emerald-500/10"
        data={admins}
        loading={loading}
        onDelete={handleDelete}
      />

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <AddUserModal
            tableTarget={showModal}
            onClose={() => setShowModal(null)}
            onSuccess={fetchAll}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
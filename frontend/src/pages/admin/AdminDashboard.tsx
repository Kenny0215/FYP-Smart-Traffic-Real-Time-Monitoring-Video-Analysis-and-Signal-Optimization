import React, { useState } from 'react';
import {
  LayoutDashboard, Shield, Users,
  MessageSquare, LogOut, ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import { TrafficLightIcon } from '../../components/TrafficLightIcon';

import { AdminOverview }   from './AdminOverview';
import { AdminComplaints } from './AdminComplaints';
import { AdminUsers }      from './AdminUsers';
import { AdminFeedback }   from './AdminFeedback';

type AdminPage = 'overview' | 'complaints' | 'users' | 'feedback';

const NAV_ITEMS: { id: AdminPage; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',   label: 'Overview',       icon: <LayoutDashboard size={18} /> },
  { id: 'complaints', label: 'Complaints',      icon: <Shield size={18} /> },
  { id: 'users',      label: 'User Management', icon: <Users size={18} /> },
  { id: 'feedback',   label: 'User Feedback',   icon: <MessageSquare size={18} /> },
];

interface AdminDashboardProps {
  userName: string;
  onLogout: () => void;
}

export const AdminDashboard = ({ userName, onLogout }: AdminDashboardProps) => {
  const [activePage, setActivePage] = useState<AdminPage>('overview');

  const renderContent = () => {
    switch (activePage) {
      case 'overview':   return <AdminOverview />;
      case 'complaints': return <AdminComplaints />;
      case 'users':      return <AdminUsers />;
      case 'feedback':   return <AdminFeedback />;
      default:           return <AdminOverview />;
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0a0f1a]">

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <TrafficLightIcon size={18} colorized />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">TrafficAI</p>
            <p className="text-emerald-500 text-[10px] font-semibold uppercase tracking-widest">Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activePage === item.id
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main Content ────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — admin name + logout moved here */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <span>Admin</span>
            <ChevronRight size={14} />
            <span className="text-white capitalize">{activePage}</span>
          </div>

          {/* Admin profile + logout */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-white text-sm font-medium leading-none">{userName}</p>
                <p className="text-emerald-500 text-[10px] font-semibold">Administrator</p>
              </div>
            </div>
            <div className="w-px h-6 bg-slate-700" />
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all text-sm"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </main>
      </div>
    </div>
  );
};
import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Upload, 
  BarChart3, 
  MessageSquare, 
  Bot,
  LogOut, 
  Menu,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils';
import { Page } from '../types';
import { TrafficLightIcon } from './TrafficLightIcon';

export const DashboardLayout = ({
  children, activePage, setPage, user, onLogout
}: {
  children:    React.ReactNode;
  activePage:  Page;
  setPage:     (p: Page) => void;
  user?:       { email?: string; user_metadata?: { full_name?: string } } | null;
  onLogout?:   () => void;
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { id: 'dashboard',  label: 'Dashboard',      icon: <LayoutDashboard size={20} /> },
    { id: 'upload',     label: 'Video Upload',    icon: <Upload size={20} /> },
    { id: 'analytics',  label: 'Analytics',       icon: <BarChart3 size={20} /> },
    { id: 'simulation', label: 'AI Simulation',   icon: <Zap size={20} /> },
    { id: 'chat',       label: 'Traffic Chatbox', icon: <Bot size={20} /> },
    { id: 'feedback',   label: 'Feedback',        icon: <MessageSquare size={20} /> },
  ];

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const handleLogout = () => {
    if (onLogout) onLogout();
    else setPage('landing');
  };

  return (
    <div className="min-h-screen flex bg-brand-bg">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-brand-card border-r border-brand-border transition-transform duration-300 lg:relative lg:translate-x-0",
        !sidebarOpen && "-translate-x-full lg:w-20"
      )}>
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
              <TrafficLightIcon className="text-white" size={18} colorized />
            </div>
            {sidebarOpen && (
              <span className="text-lg font-bold text-white tracking-tight">SmartTraffic</span>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id as Page)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
                  activePage === item.id
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <span className={cn(
                  activePage === item.id
                    ? "text-white"
                    : "text-slate-500 group-hover:text-emerald-500"
                )}>
                  {item.icon}
                </span>
                {sidebarOpen && (
                  <span className="font-medium text-sm">{item.label}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-brand-card/50 backdrop-blur-md border-b border-brand-border px-6 flex items-center justify-between sticky top-0 z-40">
          {/* Left — menu toggle + page title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 text-slate-400 hover:text-white lg:hidden"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">
              {navItems.find(i => i.id === activePage)?.label || 'Control Center'}
            </h2>
          </div>

          {/* Right — user name + logout */}
          <div className="flex items-center gap-3">
            {/* Avatar + name */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">
                  {userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs text-slate-400 leading-none mb-0.5">Welcome back</p>
                <p className="text-sm font-semibold text-white leading-none">{userName}</p>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-slate-700" />

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all text-sm"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline font-medium">Logout</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};
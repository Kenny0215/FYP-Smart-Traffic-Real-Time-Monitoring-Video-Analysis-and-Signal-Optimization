import React from 'react';
import { cn } from '../utils';

export const Badge = ({ children, variant = 'default', className }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'outline'; className?: string }) => {
  const variants = {
    default: 'bg-slate-800 text-slate-400',
    success: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
    outline: 'bg-transparent border border-slate-700 text-slate-500',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center justify-center', variants[variant], className)}>
      {children}
    </span>
  );
};

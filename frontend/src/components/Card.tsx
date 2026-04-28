import React from 'react';
import { cn } from '../utils';

export const Card = ({ children, className, title, subtitle, actions }: { children: React.ReactNode; className?: string; title?: string; subtitle?: string; actions?: React.ReactNode; key?: React.Key }) => (
  <div className={cn('glass-panel p-6', className)}>
    {(title || subtitle || actions) && (
      <div className="mb-6 flex justify-between items-start">
        <div>
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </div>
);

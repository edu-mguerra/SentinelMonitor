import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
}: MetricCardProps) {
  let iconBg = 'bg-slate-800 text-slate-300';

  if (variant === 'success') {
    iconBg = 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40';
  } else if (variant === 'danger') {
    iconBg = 'bg-rose-950/80 text-rose-400 border border-rose-800/40';
  } else if (variant === 'warning') {
    iconBg = 'bg-amber-950/80 text-amber-400 border border-amber-800/40';
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-sm hover:border-slate-700/80 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{title}</span>
        <div className={`p-2.5 rounded-lg ${iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

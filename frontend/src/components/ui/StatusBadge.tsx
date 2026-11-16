import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const normalized = status.toLowerCase();

  let colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';
  let dotClasses = 'bg-slate-400';
  let pulse = false;
  let label = status.toUpperCase();

  if (normalized === 'online' || normalized === 'up') {
    colorClasses = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50';
    dotClasses = 'bg-emerald-400';
    pulse = true;
    label = normalized === 'online' ? 'Online' : 'Disponível';
  } else if (normalized === 'offline' || normalized === 'down') {
    colorClasses = 'bg-rose-950/60 text-rose-400 border-rose-800/50';
    dotClasses = 'bg-rose-400';
    pulse = true;
    label = normalized === 'offline' ? 'Offline' : 'Indisponível';
  } else if (normalized === 'warning' || normalized === 'degraded') {
    colorClasses = 'bg-amber-950/60 text-amber-400 border-amber-800/50';
    dotClasses = 'bg-amber-400';
    pulse = true;
    label = 'Degradado';
  } else if (normalized === 'pending') {
    colorClasses = 'bg-blue-950/60 text-blue-400 border-blue-800/50';
    dotClasses = 'bg-blue-400';
    label = 'Aguardando Agente';
  } else if (normalized === 'paused') {
    colorClasses = 'bg-slate-800 text-slate-400 border-slate-700';
    dotClasses = 'bg-slate-400';
    label = 'Pausado';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colorClasses} ${className}`}
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClasses}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClasses}`} />
      </span>
      {label}
    </span>
  );
}

'use client';

import React from 'react';
import { Monitor, Terminal } from 'lucide-react';

interface OsBadgeProps {
  osName?: string;
  osVersion?: string;
  arch?: string;
  compact?: boolean;
}

type OsFamily = 'windows' | 'macos' | 'linux' | 'unknown';

function detectOsFamily(osName?: string): OsFamily {
  if (!osName) return 'unknown';
  const normalized = osName.toLowerCase();
  if (normalized.includes('win')) return 'windows';
  if (normalized.includes('mac') || normalized.includes('darwin')) return 'macos';
  return 'linux';
}

function OsIcon({ family }: { family: OsFamily }) {
  if (family === 'windows') {
    return (
      <svg className="w-3.5 h-3.5 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M2 3.5L10.5 2.3V11.3H2V3.5ZM11.7 2.1L22 0.7V11.3H11.7V2.1ZM2 12.6H10.5V21.7L2 20.5V12.6ZM11.7 12.6H22V23.3L11.7 21.9V12.6Z" />
      </svg>
    );
  }
  if (family === 'macos') {
    return (
      <svg className="w-3.5 h-3.5 text-slate-200 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
      </svg>
    );
  }
  if (family === 'linux') {
    return <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  return <Monitor className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
}

export function OsBadge({ osName, osVersion, arch, compact = false }: OsBadgeProps) {
  const family = detectOsFamily(osName);
  const label = osName
    ? `${osName}${osVersion ? ` ${osVersion}` : ''}`
    : 'Aguardando SO';

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-300">
        <OsIcon family={family} />
        <span>{label}</span>
        {arch && <span className="text-slate-500">({arch})</span>}
      </span>
    );
  }

  return (
    <div className="py-2.5 px-3 bg-slate-950/60 rounded-xl border border-slate-800/80 mb-4 text-xs text-slate-300 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <OsIcon family={family} />
        <span className="truncate">{label}</span>
      </div>
      {arch && <span className="font-mono text-[10px] text-slate-500 shrink-0">{arch}</span>}
    </div>
  );
}

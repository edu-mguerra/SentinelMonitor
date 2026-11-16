'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, Crown } from 'lucide-react';

export function Header({ title }: { title: string }) {
  const { user, currentOrganization, organizations } = useAuth();
  const isMaster = Boolean(user?.is_superuser);

  return (
    <header className="min-h-16 py-2.5 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 px-8 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white tracking-tight">{title}</h1>
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-950/40 border border-emerald-800/40 rounded-full text-[11px] text-emerald-400">
          <Activity className="w-3 h-3 animate-pulse" />
          <span>Monitoramento Ativo</span>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">

        {isMaster && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 border border-amber-500/40 rounded-xl">
            <Crown className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-amber-300 tracking-wide uppercase">
                Conta Master
              </span>
              <span className="hidden lg:inline text-amber-200/80 ml-1.5 font-medium">
                • Gestor da Plataforma
              </span>
            </div>
          </div>
        )}

        {currentOrganization && (
          <div className="text-xs text-slate-400 hidden sm:block">
            Empresa: <strong className="text-slate-200">{currentOrganization.name}</strong>
          </div>
        )}

        {user && (
          <div className="hidden sm:flex flex-col text-right pl-3 border-l border-slate-800">
            <span className="text-xs font-semibold text-white leading-tight">
              {user.full_name || 'Usuário'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono leading-tight">
              {user.email}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

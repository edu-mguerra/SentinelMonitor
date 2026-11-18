'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileMenu } from '@/contexts/MobileMenuContext';
import { Activity, Crown, Menu } from 'lucide-react';

export function Header({ title }: { title: string }) {
  const { user, currentOrganization } = useAuth();
  const { toggle } = useMobileMenu();
  const isMaster = Boolean(user?.is_superuser);

  return (
    <header className="min-h-16 py-2.5 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={toggle}
          className="p-2 -ml-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors md:hidden shrink-0"
          aria-label="Abrir menu de navegação"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight truncate">
          {title}
        </h1>

        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-950/40 border border-emerald-800/40 rounded-full text-[11px] text-emerald-400 shrink-0">
          <Activity className="w-3 h-3 animate-pulse" />
          <span>Monitoramento Ativo</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {isMaster && (
          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-amber-500/15 border border-amber-500/40 rounded-xl">
            <Crown className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-amber-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-amber-300 tracking-wide uppercase text-[10px] sm:text-xs">
                Master
              </span>
              <span className="hidden xl:inline text-amber-200/80 ml-1.5 font-medium">
                • Gestor da Plataforma
              </span>
            </div>
          </div>
        )}

        {currentOrganization && (
          <div className="text-xs text-slate-400 hidden sm:block max-w-[150px] md:max-w-[200px] truncate">
            Empresa: <strong className="text-slate-200">{currentOrganization.name}</strong>
          </div>
        )}

        {user && (
          <div className="hidden md:flex flex-col text-right pl-3 border-l border-slate-800">
            <span className="text-xs font-semibold text-white leading-tight truncate max-w-[150px]">
              {user.full_name || 'Usuário'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono leading-tight truncate max-w-[150px]">
              {user.email}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

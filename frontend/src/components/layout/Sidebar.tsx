'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  LayoutDashboard,
  Server,
  Globe,
  AlertOctagon,
  Bell,
  LogOut,
  Building,
  Plus,
  Crown,
  User as UserIcon,
  X,
  Check,
  Users,
  Rocket,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileMenu } from '@/contexts/MobileMenuContext';

export function Sidebar() {
  const pathname = usePathname();
  const { user, organizations, currentOrganization, switchOrganization, createOrganization, logout } = useAuth();
  const { isOpen, close } = useMobileMenu();

  const [isNewOrgOpen, setIsNewOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  const isMaster = Boolean(user?.is_superuser);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Servidores (VPS)', href: '/servers', icon: Server },
    { name: 'Monitores Externos', href: '/monitors', icon: Globe },
    { name: 'Incidentes', href: '/incidents', icon: AlertOctagon },
    { name: 'Alertas por E-mail', href: '/alerts', icon: Bell },
    ...(isMaster
      ? [
          { name: 'Usuários Cadastrados', href: '/admin/users', icon: Users },
          { name: 'Lançar Atualizações', href: '/admin/updates', icon: Rocket },
        ]
      : []),
  ];

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      await createOrganization(newOrgName.trim());
      setNewOrgName('');
      setIsNewOrgOpen(false);
    } catch (err: any) {
      alert(err?.message || 'Erro ao criar nova empresa');
    } finally {
      setCreatingOrg(false);
    }
  };

  const renderContent = (isMobile = false) => (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-base text-white tracking-wide">Sentinel</span>
              <span className="text-xs block text-slate-400 font-normal">Infrastructure</span>
            </div>
          </div>
          {isMobile && (
            <button
              onClick={close}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-4 border-b border-slate-800/60 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Empresa / Tenant
            </label>
            <button
              type="button"
              onClick={() => setIsNewOrgOpen(!isNewOrgOpen)}
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-0.5 transition-colors"
              title="Cadastrar nova empresa/organização"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Empresa
            </button>
          </div>

          {isNewOrgOpen && (
            <form onSubmit={handleCreateOrg} className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">Nome da nova empresa:</span>
                <button
                  type="button"
                  onClick={() => setIsNewOrgOpen(false)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                required
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Ex: Filial Cloud SP"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={creatingOrg}
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {creatingOrg ? 'Criando...' : 'Criar Empresa'}
              </button>
            </form>
          )}

          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-sm text-slate-200">
              <Building className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={currentOrganization?.id || ''}
                onChange={(e) => {
                  const targetOrg = organizations.find((o) => o.id === e.target.value);
                  if (targetOrg) switchOrganization(targetOrg);
                }}
                className="bg-transparent border-none text-white text-xs w-full focus:outline-none cursor-pointer truncate"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id} className="bg-slate-900 text-white">
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => {
                  if (isMobile) close();
                }}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800 space-y-3 shrink-0">
        <div
          className={`p-3 rounded-xl border ${
            isMaster
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 mb-1">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isMaster
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {isMaster ? <Crown className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
            </div>
            <div className="truncate">
              {isMaster && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 mb-0.5">
                  Conta Master
                </span>
              )}
              <p className="text-xs font-semibold text-white truncate">
                {user?.full_name || 'Usuário'}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-mono truncate">{user?.email}</p>
        </div>

        <button
          onClick={() => {
            if (isMobile) close();
            logout();
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/40 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Sair / Trocar Conta
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden md:flex w-64 bg-slate-900 border-r border-slate-800 flex-col justify-between shrink-0 select-none">
        {renderContent(false)}
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={close}
          />
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 flex flex-col justify-between select-none shadow-2xl z-10">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}

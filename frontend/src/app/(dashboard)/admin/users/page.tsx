'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import {
  Users,
  Mail,
  ShieldCheck,
  Crown,
  User as UserIcon,
  Calendar,
  Lock,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  UserCheck,
  UserX,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Server as ServerIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateBR } from '@/lib/date';
import { adminService } from '@/services/admin.service';
import { AdminUser } from '@/types/auth';

export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user && !user.is_superuser) {
      router.push('/');
    }
  }, [user, router]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await adminService.listUsers();
      setUsers(data);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao carregar lista de usuários.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.is_superuser) {
      fetchUsers();
    }
  }, [user]);

  const handleApprove = async (userId: string) => {
    setActionLoadingId(userId);
    setFeedback(null);
    try {
      const updated = await adminService.approveUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_active: true } : u)));
      setFeedback({ type: 'success', text: `Acesso do usuário ${updated.email} aprovado com sucesso! E-mail de notificação enviado.` });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Falha ao aprovar usuário.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleActive = async (userId: string) => {
    setActionLoadingId(userId);
    setFeedback(null);
    try {
      const updated = await adminService.toggleUserActive(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_active: updated.is_active } : u)));
      setFeedback({
        type: 'success',
        text: `Status do usuário ${updated.email} alterado para ${updated.is_active ? 'Ativo' : 'Inativo'}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Falha ao alterar status do usuário.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário ${email}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setActionLoadingId(userId);
    setFeedback(null);
    try {
      await adminService.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setFeedback({ type: 'success', text: `Usuário ${email} excluído com sucesso.` });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Falha ao excluir usuário.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingCount = users.filter((u) => !u.is_active).length;
  const activeCount = users.filter((u) => u.is_active).length;

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (u.full_name && u.full_name.toLowerCase().includes(term)) ||
      u.email.toLowerCase().includes(term);

    if (!matchesSearch) return false;

    if (statusFilter === 'pending') return !u.is_active;
    if (statusFilter === 'active') return u.is_active;
    return true;
  });

  if (!user?.is_superuser) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Gestão de Usuários (Painel Master)" />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-start gap-3.5 shadow-sm">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400 shrink-0 mt-0.5">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Privacidade Estrita & Governança de Acessos
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Como Administrador Master, você aprova novos cadastros de clientes e gerencia status de contas.
              Por conformidade e privacidade estrita, os servidores, métricas de hardware, partições de disco, serviços e monitores de cada usuário permanecem
              <strong> 100% isolados no tenant de cada organização</strong>.
            </p>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-white ml-3 text-xs"
            >
              Fechar
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Todos ({users.length})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                statusFilter === 'pending'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-amber-400 hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Aguardando Aprovação ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-emerald-400 hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ativos / Aprovados ({activeCount})
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 sm:min-w-[220px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              Nenhum usuário encontrado para este filtro.
            </div>
          ) : (
            <>
              <div className="md:hidden divide-y divide-slate-800/80">
                {filteredUsers.map((u) => {
                  const isSelf = user?.id === u.id;
                  const isBusy = actionLoadingId === u.id;

                  return (
                    <div key={u.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              u.is_superuser
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {u.is_superuser ? <Crown className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-white block text-sm truncate">
                              {u.full_name || 'Sem nome informado'}
                            </span>
                            <span className="text-xs text-slate-400 font-mono block truncate">
                              {u.email}
                            </span>
                          </div>
                        </div>

                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                            <CheckCircle2 className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 shrink-0">
                            <Clock className="w-3 h-3 animate-pulse" /> Pendente
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1 font-mono text-white bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                            <ServerIcon className="w-3 h-3 text-blue-400" />
                            {u.servers_count ?? 0} VPS
                          </span>
                          <span className="text-[11px]">
                            {u.is_superuser ? 'Master' : 'Cliente'}
                          </span>
                          <span className="text-[11px] flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {formatDateBR(u.created_at)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {!u.is_active && (
                            <button
                              onClick={() => handleApprove(u.id)}
                              disabled={isBusy}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                            >
                              <CheckCircle2 className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                              Aprovar
                            </button>
                          )}

                          {!isSelf && (
                            <>
                              <button
                                onClick={() => handleToggleActive(u.id)}
                                disabled={isBusy}
                                className="p-1.5 rounded-lg border bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 transition-colors disabled:opacity-50"
                                title={u.is_active ? 'Desativar usuário' : 'Ativar usuário'}
                              >
                                {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </button>

                              {!u.is_superuser && (
                                <button
                                  onClick={() => handleDelete(u.id, u.email)}
                                  disabled={isBusy}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-800/80 text-slate-400 hover:text-rose-300 transition-colors disabled:opacity-50"
                                  title="Excluir usuário"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 xl:px-5 py-3.5">Usuário / Nome</th>
                    <th className="px-4 xl:px-5 py-3.5">E-mail</th>
                    <th className="px-4 xl:px-5 py-3.5">Tipo</th>
                    <th className="px-4 xl:px-5 py-3.5">VPSs</th>
                    <th className="px-4 xl:px-5 py-3.5">Cadastro</th>
                    <th className="px-4 xl:px-5 py-3.5">Status</th>
                    <th className="px-4 xl:px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredUsers.map((u) => {
                    const isSelf = user?.id === u.id;
                    const isBusy = actionLoadingId === u.id;

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 xl:px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                u.is_superuser
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {u.is_superuser ? <Crown className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                            </div>
                            <div>
                              <span className="font-semibold text-white block">
                                {u.full_name || 'Sem nome informado'}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                ID: {u.id.slice(0, 8)}...
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 xl:px-5 py-4">
                          <div className="flex items-center gap-2 text-slate-300 font-mono text-xs">
                            <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate max-w-[200px] xl:max-w-none">{u.email}</span>
                          </div>
                        </td>
                        <td className="px-4 xl:px-5 py-4">
                          {u.is_superuser ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg">
                              <Crown className="w-3 h-3" /> Master
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700 rounded-lg">
                              Cliente
                            </span>
                          )}
                        </td>
                        <td className="px-4 xl:px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <ServerIcon className="w-3.5 h-3.5 text-blue-400" />
                            <span className="font-mono text-xs font-bold text-white">
                              {u.servers_count ?? 0}
                            </span>
                            <span className="text-[11px] text-slate-500">VPS</span>
                          </div>
                        </td>
                        <td className="px-4 xl:px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>{formatDateBR(u.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-4 xl:px-5 py-4">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                              <Clock className="w-3.5 h-3.5 animate-pulse" /> Aguardando
                            </span>
                          )}
                        </td>
                        <td className="px-4 xl:px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!u.is_active && (
                              <button
                                onClick={() => handleApprove(u.id)}
                                disabled={isBusy}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                                title="Aprovar conta e liberar acesso à plataforma"
                              >
                                <CheckCircle2 className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                                Aprovar Acesso
                              </button>
                            )}

                            {!isSelf && (
                              <>
                                <button
                                  onClick={() => handleToggleActive(u.id)}
                                  disabled={isBusy}
                                  className={`p-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                                    u.is_active
                                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-amber-400'
                                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-emerald-400'
                                  }`}
                                  title={u.is_active ? 'Desativar usuário' : 'Ativar usuário'}
                                >
                                  {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                </button>

                                {!u.is_superuser && (
                                  <button
                                    onClick={() => handleDelete(u.id, u.email)}
                                    disabled={isBusy}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-800/80 text-slate-400 hover:text-rose-300 transition-colors disabled:opacity-50"
                                    title="Excluir usuário"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

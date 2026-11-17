'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InstallModal } from '@/components/ui/InstallModal';
import { UpdateAgentModal } from '@/components/ui/UpdateAgentModal';
import { ServerShareModal } from '@/components/ui/ServerShareModal';
import { OsBadge } from '@/components/ui/OsBadge';
import {
  Server as ServerIcon,
  Plus,
  Terminal,
  Trash2,
  RefreshCw,
  Cpu,
  HardDrive,
  Database,
  ArrowRight,
  ArrowUpCircle,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { serversService } from '@/services/servers.service';
import {
  AgentReleaseInfo,
  Server,
  ServerWithInstallCommand,
  SharedServerItem,
  ShareInviteItem,
} from '@/types/server';
import { formatDateBR } from '@/lib/date';

export default function ServersPage() {
  const { currentOrganization } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [sharedServers, setSharedServers] = useState<SharedServerItem[]>([]);
  const [pendingInvites, setPendingInvites] = useState<ShareInviteItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'my_servers' | 'shared_servers'>('my_servers');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [createdServer, setCreatedServer] = useState<ServerWithInstallCommand | null>(null);
  const [agentRelease, setAgentRelease] = useState<AgentReleaseInfo | null>(null);
  const [updateTargetServer, setUpdateTargetServer] = useState<Server | null>(null);
  const [serverToShare, setServerToShare] = useState<Server | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [inviteLoadingId, setInviteLoadingId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchServers = async (silent = false) => {
    if (!currentOrganization) return;
    if (!silent) setLoading(true);
    try {
      const [data, release, sharedData, invitesData] = await Promise.all([
        serversService.listServers(currentOrganization.id),
        serversService.getAgentRelease().catch(() => null),
        serversService.listSharedServers().catch(() => []),
        serversService.listPendingInvites().catch(() => []),
      ]);
      setServers(data);
      if (release) setAgentRelease(release);
      setSharedServers(sharedData);
      setPendingInvites(invitesData);
    } catch (err) {
      console.error('Erro ao carregar servidores:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(() => fetchServers(true), 10000);
    return () => clearInterval(interval);
  }, [currentOrganization]);

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !newServerName.trim()) return;

    setActionLoading(true);
    try {
      const srv = await serversService.createServer(currentOrganization.id, newServerName);
      setCreatedServer(srv);
      setNewServerName('');
      setIsAddModalOpen(false);
      fetchServers();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar servidor');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (serverId: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;
    if (!confirm('Deseja realmente remover este servidor e todo o histórico de métricas?')) return;

    try {
      await serversService.deleteServer(currentOrganization.id, serverId);
      fetchServers();
    } catch (err: any) {
      alert(err.message || 'Erro ao deletar servidor');
    }
  };

  const handleShowInstallCmd = async (serverId: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;

    try {
      const srv = await serversService.regenerateToken(currentOrganization.id, serverId);
      setCreatedServer(srv);
    } catch (err: any) {
      alert(err.message || 'Erro ao obter comando de instalação');
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    setInviteLoadingId(inviteId);
    setInviteFeedback(null);
    try {
      const accepted = await serversService.acceptInvite(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      setSharedServers((prev) => [accepted, ...prev]);
      setInviteFeedback({
        type: 'success',
        text: `VPS Amiga '${accepted.server.name}' aceita com sucesso! Você agora acompanha telemetria e receberá alertas deste host.`,
      });
    } catch (err: any) {
      setInviteFeedback({ type: 'error', text: err.message || 'Falha ao aceitar convite.' });
    } finally {
      setInviteLoadingId(null);
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    setInviteLoadingId(inviteId);
    setInviteFeedback(null);
    try {
      await serversService.rejectInvite(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err: any) {
      setInviteFeedback({ type: 'error', text: err.message || 'Falha ao recusar convite.' });
    } finally {
      setInviteLoadingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Servidores Monitorados (VPS)" />

      <main className="flex-1 p-8 space-y-6">
        {pendingInvites.length > 0 && (
          <div className="p-4 bg-gradient-to-r from-blue-950/70 to-slate-900 border border-blue-800/80 rounded-2xl shadow-lg space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2.5 text-blue-300">
              <Users className="w-5 h-5 text-blue-400 shrink-0" />
              <h3 className="text-sm font-bold text-white">
                Convites de VPS Amiga Pendentes ({pendingInvites.length})
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Outros administradores convidaram você para acompanhar o monitoramento de seus servidores. Ao aceitar, o servidor aparecerá na sua lista e você passará a receber notificações de incidentes por e-mail:
            </p>

            <div className="space-y-2 pt-1">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white font-mono text-sm">{inv.server_name}</span>
                      <span className="text-[11px] text-slate-400">
                        por <strong>{inv.owner_name}</strong> ({inv.owner_email})
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Recebido em {formatDateBR(inv.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleAcceptInvite(inv.id)}
                      disabled={inviteLoadingId === inv.id}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${inviteLoadingId === inv.id ? 'animate-spin' : ''}`} />
                      Aceitar Acesso
                    </button>
                    <button
                      onClick={() => handleRejectInvite(inv.id)}
                      disabled={inviteLoadingId === inv.id}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {inviteFeedback && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
              inviteFeedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {inviteFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{inviteFeedback.text}</span>
            </div>
            <button
              onClick={() => setInviteFeedback(null)}
              className="text-slate-400 hover:text-white text-xs ml-2"
            >
              Fechar
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Gerenciamento de Servidores</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Instale o agente (Linux, macOS ou Windows) para acompanhar CPU, RAM, discos e processos em tempo real.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchServers()}
              className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" /> Adicionar Servidor
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('my_servers')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-t-xl transition-all border-b-2 -mb-px ${
              activeTab === 'my_servers'
                ? 'border-blue-500 text-blue-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <ServerIcon className="w-4 h-4" />
            Meus Servidores ({servers.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shared_servers')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-t-xl transition-all border-b-2 -mb-px ${
              activeTab === 'shared_servers'
                ? 'border-blue-500 text-blue-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Users className="w-4 h-4" />
            VPSs Amigas Compartilhadas ({sharedServers.length})
            {sharedServers.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono font-bold">
                {sharedServers.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'my_servers' && (
          <>
            {servers.length === 0 && !loading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto">
                <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400 flex items-center justify-center mx-auto mb-4">
                  <ServerIcon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-white">Nenhum servidor conectado</h3>
                <p className="text-xs text-slate-400 mt-1 mb-6">
                  Cadastre sua VPS para gerar o comando de instalação do agente e começar a monitorar.
                </p>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Meu Primeiro Servidor
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {servers.map((srv) => (
                  <div
                    key={srv.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300">
                            <ServerIcon className="w-5 h-5 text-blue-400" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-white truncate max-w-[160px]">{srv.name}</h4>
                            <span className="text-[11px] text-slate-400 block truncate">
                              {srv.hostname || 'Aguardando conexão'}
                            </span>
                          </div>
                        </div>
                        <StatusBadge status={srv.status} />
                      </div>

                      <OsBadge osName={srv.os_name} osVersion={srv.os_version} arch={srv.arch} />

                      {srv.status !== 'pending' &&
                        agentRelease &&
                        (srv.agent_version || '1.0.0') !== agentRelease.latest_version && (
                          <button
                            type="button"
                            onClick={() => setUpdateTargetServer(srv)}
                            title={`Versão atual: v${srv.agent_version || '1.0.0'} • Clique para ver como atualizar`}
                            className="w-full mb-3 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400/50 text-left flex items-center justify-between gap-2 transition-all group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="relative flex h-2 w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                              </span>
                              <span className="text-[11px] font-semibold text-amber-300 truncate">
                                Atualização v{agentRelease.latest_version} (atual: v{srv.agent_version || '1.0.0'})
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-amber-400 group-hover:text-amber-200 shrink-0 flex items-center gap-1">
                              <ArrowUpCircle className="w-3.5 h-3.5" />
                              Atualizar
                            </span>
                          </button>
                        )}

                      {srv.status === 'online' ? (
                        <div className="space-y-2 mb-4">
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                              <span className="flex items-center gap-1">
                                <Cpu className="w-3 h-3 text-blue-400" /> CPU
                              </span>
                              <span className="font-mono text-slate-200">{srv.last_cpu_percent || 0}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, srv.last_cpu_percent || 0)}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                              <span className="flex items-center gap-1">
                                <Database className="w-3 h-3 text-emerald-400" /> RAM
                              </span>
                              <span className="font-mono text-slate-200">{srv.last_ram_percent || 0}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, srv.last_ram_percent || 0)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl mb-4">
                          {srv.status === 'pending'
                            ? 'Agente ainda não foi executado na VPS'
                            : 'Servidor desconectado recentemente'}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                      <div className="flex items-center gap-3">
                        {srv.status === 'pending' ? (
                          <button
                            onClick={(e) => handleShowInstallCmd(srv.id, e)}
                            className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1.5"
                          >
                            <Terminal className="w-3.5 h-3.5" /> Ver comando
                          </button>
                        ) : (
                          <Link
                            href={`/servers/${srv.id}`}
                            className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1"
                          >
                            Ver Telemetria <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        )}

                        <button
                          type="button"
                          onClick={() => setServerToShare(srv)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-blue-300 text-[11px] font-medium flex items-center gap-1.5 border border-slate-700 transition-colors"
                          title="Compartilhar monitoramento com outra pessoa (VPS Amiga)"
                        >
                          <Users className="w-3 h-3 text-blue-400" />
                          VPS Amiga
                        </button>
                      </div>

                      <button
                        onClick={(e) => handleDelete(srv.id, e)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Excluir servidor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'shared_servers' && (
          <>
            {sharedServers.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto">
                <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-white">Nenhuma VPS Amiga conectada</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Quando outro usuário do Sentinel Monitor compartilhar um servidor com o seu e-mail e você aceitar, ele aparecerá aqui com telemetria completa e notificações de alertas ativas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sharedServers.map((item) => {
                  const srv = item.server;
                  return (
                    <div
                      key={item.share_id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="mb-3 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between text-[11px] text-blue-300">
                          <span className="flex items-center gap-1.5 truncate">
                            <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            De: <strong>{item.owner_name}</strong>
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">{item.owner_email}</span>
                        </div>

                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300">
                              <ServerIcon className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-white truncate max-w-[160px]">{srv.name}</h4>
                              <span className="text-[11px] text-slate-400 block truncate">
                                {srv.hostname || 'Host ativo'}
                              </span>
                            </div>
                          </div>
                          <StatusBadge status={srv.status} />
                        </div>

                        <OsBadge osName={srv.os_name} osVersion={srv.os_version} arch={srv.arch} />

                        {srv.status === 'online' ? (
                          <div className="space-y-2 mb-4">
                            <div>
                              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                                <span className="flex items-center gap-1">
                                  <Cpu className="w-3 h-3 text-blue-400" /> CPU
                                </span>
                                <span className="font-mono text-slate-200">{srv.last_cpu_percent || 0}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, srv.last_cpu_percent || 0)}%` }}
                                />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                                <span className="flex items-center gap-1">
                                  <Database className="w-3 h-3 text-emerald-400" /> RAM
                                </span>
                                <span className="font-mono text-slate-200">{srv.last_ram_percent || 0}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, srv.last_ram_percent || 0)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="py-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl mb-4">
                            Servidor offline ou sem telemetria recente
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                        <Link
                          href={`/servers/${srv.id}?shared=1`}
                          className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1.5"
                        >
                          Acessar Telemetria Amiga <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                        <span className="text-[10px] text-slate-500">Acesso Concedido</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-1">Adicionar Novo Servidor</h3>
            <p className="text-xs text-slate-400 mb-4">
              Informe um nome amigável para identificar esta máquina no dashboard.
            </p>

            <form onSubmit={handleCreateServer} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Nome do Servidor</label>
                <input
                  type="text"
                  required
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="Ex: VPS Produção Hetzner SP"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all"
                >
                  {actionLoading ? 'Gerando comando...' : 'Continuar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createdServer && (
        <InstallModal
          isOpen={!!createdServer}
          onClose={() => setCreatedServer(null)}
          serverName={createdServer.name}
          installCommand={createdServer.install_command}
          installCommands={createdServer.install_commands}
          expiresAt={createdServer.install_token_expires_at}
        />
      )}

      <UpdateAgentModal
        isOpen={!!updateTargetServer}
        onClose={() => setUpdateTargetServer(null)}
        server={servers.find((s) => s.id === updateTargetServer?.id) || updateTargetServer}
        release={agentRelease}
      />

      {serverToShare && currentOrganization && (
        <ServerShareModal
          isOpen={!!serverToShare}
          onClose={() => setServerToShare(null)}
          server={serverToShare}
          orgId={currentOrganization.id}
        />
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InstallModal } from '@/components/ui/InstallModal';
import { UpdateAgentModal } from '@/components/ui/UpdateAgentModal';
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
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { serversService } from '@/services/servers.service';
import { AgentReleaseInfo, Server, ServerWithInstallCommand } from '@/types/server';

export default function ServersPage() {
  const { currentOrganization } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [createdServer, setCreatedServer] = useState<ServerWithInstallCommand | null>(null);
  const [agentRelease, setAgentRelease] = useState<AgentReleaseInfo | null>(null);
  const [updateTargetServer, setUpdateTargetServer] = useState<Server | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchServers = async (silent = false) => {
    if (!currentOrganization) return;
    if (!silent) setLoading(true);
    try {
      const [data, release] = await Promise.all([
        serversService.listServers(currentOrganization.id),
        serversService.getAgentRelease().catch(() => null),
      ]);
      setServers(data);
      if (release) setAgentRelease(release);
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

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Servidores Monitorados (VPS)" />

      <main className="flex-1 p-8 space-y-6">
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
                        title={`Versão atual: v${srv.agent_version || '1.0.0'} • Clique para ver o que há de novo e como atualizar`}
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
    </div>
  );
}

'use client';

import React, { useEffect, useState, use, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OsBadge } from '@/components/ui/OsBadge';
import { UpdateAgentModal } from '@/components/ui/UpdateAgentModal';
import { CpuMemoryChart } from '@/components/charts/CpuMemoryChart';
import { NetworkChart } from '@/components/charts/NetworkChart';
import {
  Server as ServerIcon,
  ArrowLeft,
  RefreshCw,
  ArrowUpCircle,
  Cpu,
  Database,
  HardDrive,
  Activity,
  Layers,
  CheckCircle2,
  XCircle,
  Sliders,
  Plus,
  X,
  Check,
  Sparkles,
  BatteryCharging,
  Thermometer,
  ShieldAlert,
  Network,
  Box,
  Gauge,
  Users,
  Search,
  Filter,
  Copy,
  AlertTriangle,
  PlayCircle,
  StopCircle,
  Terminal,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatTimeBR } from '@/lib/date';
import { serversService } from '@/services/servers.service';
import { AgentReleaseInfo, ServerDetail } from '@/types/server';

function formatUptime(seconds?: number): string {
  if (!seconds) return '--';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const PRESET_SERVICES = [
  'redis',
  'pm2',
  'node',
  'supervisor',
  'celery',
  'rabbitmq',
  'mongod',
  'caddy',
  'postgres',
  'docker',
  'nginx',
  'mysqld',
];

type ServerTab = 'overview' | 'containers' | 'services';

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const serverId = resolvedParams.id;
  const { currentOrganization } = useAuth();
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [agentRelease, setAgentRelease] = useState<AgentReleaseInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<ServerTab>('overview');

  const [containerSearch, setContainerSearch] = useState('');
  const [containerFilter, setContainerFilter] = useState<'all' | 'running' | 'restarting' | 'exited'>('all');
  const [pm2Search, setPm2Search] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [servicesListConfig, setServicesListConfig] = useState<string[]>([]);
  const [newServiceInput, setNewServiceInput] = useState('');
  const [savingServices, setSavingServices] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [isSharedServer, setIsSharedServer] = useState(false);

  const fetchServer = async () => {
    try {
      let data: ServerDetail | null = null;
      const isSharedParam = typeof window !== 'undefined' && window.location.search.includes('shared=1');

      if (isSharedParam) {
        data = await serversService.getSharedServerDetail(serverId);
        setIsSharedServer(true);
      } else if (currentOrganization) {
        try {
          data = await serversService.getServer(currentOrganization.id, serverId);
          setIsSharedServer(false);
        } catch {
          data = await serversService.getSharedServerDetail(serverId);
          setIsSharedServer(true);
        }
      } else {
        data = await serversService.getSharedServerDetail(serverId);
        setIsSharedServer(true);
      }

      const release = await serversService.getAgentRelease().catch(() => null);
      if (data) setServer(data);
      if (release) setAgentRelease(release);
    } catch (err) {
      console.error('Erro ao carregar detalhes do servidor:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServer();
    const interval = setInterval(fetchServer, 10000);
    return () => clearInterval(interval);
  }, [currentOrganization, serverId]);

  const handleOpenConfigModal = () => {
    const currentList =
      server?.monitored_services && server.monitored_services.length > 0
        ? server.monitored_services
        : ['nginx', 'docker', 'postgres', 'mysqld', 'apache2'];
    setServicesListConfig([...currentList]);
    setNewServiceInput('');
    setSaveError('');
    setSaveSuccess(false);
    setIsModalOpen(true);
  };

  const handleAddService = (nameToAdd?: string) => {
    const raw = (nameToAdd || newServiceInput).trim().toLowerCase();
    if (!raw) return;
    if (servicesListConfig.includes(raw)) {
      setSaveError(`O serviço '${raw}' já está na lista.`);
      return;
    }
    setServicesListConfig([...servicesListConfig, raw]);
    setNewServiceInput('');
    setSaveError('');
  };

  const handleRemoveService = (serviceToRemove: string) => {
    setServicesListConfig(servicesListConfig.filter((s) => s !== serviceToRemove));
  };

  const handleSaveServices = async () => {
    if (!currentOrganization || !server) return;
    setSavingServices(true);
    setSaveError('');
    try {
      await serversService.updateServer(currentOrganization.id, server.id, {
        monitored_services: servicesListConfig,
      });
      setSaveSuccess(true);
      await fetchServer();
      setTimeout(() => {
        setIsModalOpen(false);
        setSaveSuccess(false);
      }, 1200);
    } catch (err: any) {
      setSaveError(err?.message || 'Falha ao salvar lista de serviços.');
    } finally {
      setSavingServices(false);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading && !server) {
    return (
      <div className="flex-1 flex flex-col min-h-screen">
        <Header title="Carregando Servidor..." />
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex-1 flex flex-col min-h-screen">
        <Header title="Servidor não encontrado" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400">
          <p>Não foi possível encontrar os dados deste servidor.</p>
          <Link href="/servers" className="text-blue-400 hover:underline">
            Voltar para lista de servidores
          </Link>
        </div>
      </div>
    );
  }

  const latestMetric = server.metrics[0];
  const diskPartitions = latestMetric?.disk_data || [];
  const servicesList = latestMetric?.services_data || [];
  const extra = latestMetric?.extra_data;

  const rawContainers = extra?.docker_containers || [];
  const rawPm2Apps = extra?.pm2_apps || [];

  const filteredContainers = rawContainers.filter((c) => {
    const term = containerSearch.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(term) ||
      c.image.toLowerCase().includes(term) ||
      (c.id && c.id.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    const state = (c.state || '').toLowerCase();
    const status = (c.status || '').toLowerCase();
    const isRestarting = state === 'restarting' || status.includes('restarting');
    const isRunning = state === 'running' && !isRestarting;
    const isExited = state === 'exited' || state === 'dead' || status.includes('exited');

    if (containerFilter === 'running') return isRunning;
    if (containerFilter === 'restarting') return isRestarting;
    if (containerFilter === 'exited') return isExited;
    return true;
  });

  const runningContainersCount = rawContainers.filter((c) => (c.state || '').toLowerCase() === 'running').length;
  const restartingContainersCount = rawContainers.filter(
    (c) => (c.state || '').toLowerCase() === 'restarting' || (c.status || '').toLowerCase().includes('restarting')
  ).length;
  const exitedContainersCount = rawContainers.filter(
    (c) => (c.state || '').toLowerCase() === 'exited' || (c.status || '').toLowerCase().includes('exited')
  ).length;

  const filteredPm2 = rawPm2Apps.filter((app) =>
    app.name.toLowerCase().includes(pm2Search.toLowerCase())
  );
  const pm2OnlineCount = rawPm2Apps.filter((a) => a.status === 'online').length;
  const pm2TotalRestarts = rawPm2Apps.reduce((acc, a) => acc + (a.restarts || 0), 0);

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title={`Telemetria: ${server.name}`} />

      <main className="flex-1 p-8 space-y-8">
        {isSharedServer && (
          <div className="p-3.5 bg-blue-950/60 border border-blue-800/80 rounded-2xl flex items-center gap-3 text-xs text-blue-200 shadow-sm animate-in fade-in">
            <Users className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              <strong>VPS Amiga:</strong> Você está visualizando este servidor através de compartilhamento com a sua conta. Todos os alertas críticos deste host também serão enviados para o seu e-mail.
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/servers"
              className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white tracking-tight">{server.name}</h2>
                <StatusBadge status={server.status} />
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <span>
                  Hostname: <span className="font-mono text-slate-300">{server.hostname || 'Não registrado'}</span>
                </span>
                <span>•</span>
                <OsBadge osName={server.os_name} osVersion={server.os_version} arch={server.arch} compact />
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {server.status !== 'pending' &&
              agentRelease &&
              (server.agent_version || '1.0.0') !== agentRelease.latest_version && (
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                  </span>
                  <ArrowUpCircle className="w-4 h-4 text-amber-400" />
                  Atualização v{agentRelease.latest_version} disponível
                </button>
              )}
            <div className="text-right text-xs text-slate-400 hidden md:block">
              <span className="block">
                Uptime: <strong className="text-white">{formatUptime(server.uptime_seconds)}</strong>
              </span>
              <span className="block text-[11px] text-slate-500">Agente v{server.agent_version || '1.0.0'}</span>
            </div>
            <button
              onClick={fetchServer}
              className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
              title="Atualizar dados agora"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Uso de CPU</span>
              <Cpu className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">{server.last_cpu_percent ?? 0}%</div>
            <p className="text-[11px] text-slate-500 mt-1">
              Load: {latestMetric?.load_avg_1m ?? 0} (1m), {latestMetric?.load_avg_5m ?? 0} (5m)
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Memória RAM</span>
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">{server.last_ram_percent ?? 0}%</div>
            <p className="text-[11px] text-slate-500 mt-1">
              Usada: {formatBytes(latestMetric?.ram_used_bytes)} / {formatBytes(latestMetric?.ram_total_bytes)}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Partição Raiz ( / )</span>
              <HardDrive className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">{server.last_disk_percent ?? 0}%</div>
            <p className="text-[11px] text-slate-500 mt-1">Espaço ocupado no disco primário</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">Último Sinal</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-sm font-semibold text-white mt-1">
              {server.last_communication_at ? formatTimeBR(server.last_communication_at) : 'Aguardando'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Transmissão contínua a cada 30s</p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-t-xl transition-all border-b-2 -mb-px ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Activity className="w-4 h-4" />
            Visão Geral & Gráficos
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('containers')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-t-xl transition-all border-b-2 -mb-px ${
              activeTab === 'containers'
                ? 'border-blue-500 text-blue-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Box className="w-4 h-4" />
            Containers & Apps
            {(rawContainers.length > 0 || rawPm2Apps.length > 0) && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono font-bold">
                {rawContainers.length + rawPm2Apps.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-t-xl transition-all border-b-2 -mb-px ${
              activeTab === 'services'
                ? 'border-blue-500 text-blue-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Serviços Monitorados ({servicesList.length})
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-semibold text-white mb-4">Histórico de CPU & Memória</h3>
                <CpuMemoryChart metrics={server.metrics} />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-semibold text-white mb-4">Tráfego de Rede (Entrada vs Saída)</h3>
                <NetworkChart metrics={server.metrics} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4">
                  <HardDrive className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-semibold text-white">Partições de Disco</h3>
                </div>

                {diskPartitions.length === 0 ? (
                  <div className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
                    Nenhuma partição reportada pelo agente.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {diskPartitions.map((d, idx) => (
                      <div key={idx} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-mono text-white font-semibold">{d.mountpoint}</span>
                          <span className="text-slate-400 font-mono">
                            {formatBytes(d.used_bytes)} de {formatBytes(d.total_bytes)} ({d.usage_percent}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              d.usage_percent > 85 ? 'bg-rose-500' : d.usage_percent > 70 ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(100, d.usage_percent)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-5 h-5 text-blue-400" />
                    <h3 className="text-base font-semibold text-white">Serviços & Processos Essenciais</h3>
                  </div>
                  <button
                    onClick={handleOpenConfigModal}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/20 transition-colors font-medium"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Configurar
                  </button>
                </div>

                {servicesList.length === 0 ? (
                  <div className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
                    Nenhum serviço reportado pelo agente ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {servicesList.map((srv, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex items-center justify-between"
                      >
                        <span className="text-xs font-semibold text-slate-200 capitalize">{srv.name}</span>
                        <div className="flex items-center gap-1.5 text-xs">
                          {srv.running ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span className="text-emerald-400 font-medium">Ativo</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-rose-400" />
                              <span className="text-rose-400 font-medium">Inativo</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {extra ? (
              <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-medium">Memória Swap</span>
                      <Database className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-xl font-bold text-white font-mono">
                      {extra.swap ? `${extra.swap.usage_percent}%` : '--'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {extra.swap && extra.swap.total_bytes > 0
                        ? `${formatBytes(extra.swap.used_bytes)} de ${formatBytes(extra.swap.total_bytes)}`
                        : 'Sem swap configurada'}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-medium">Disco I/O</span>
                      <Gauge className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-sm font-bold text-white font-mono">
                      R: {extra.disk_io?.read_kbps ?? 0} KB/s
                    </div>
                    <p className="text-xs font-mono text-slate-400 mt-1">
                      W: {extra.disk_io?.write_kbps ?? 0} KB/s
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-medium">Hardware & Sensores</span>
                      {extra.hardware?.battery ? (
                        <BatteryCharging className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Thermometer className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-white font-mono">
                      {extra.hardware?.battery
                        ? `Bateria ${extra.hardware.battery.percent}% (${extra.hardware.battery.power_plugged ? 'Tomada' : 'Bateria'})`
                        : extra.hardware?.cpu_freq_mhz
                          ? `${extra.hardware.cpu_freq_mhz} MHz`
                          : 'Sem sensores'}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {extra.hardware?.temperatures && extra.hardware.temperatures.length > 0
                        ? `${extra.hardware.temperatures[0].label}: ${extra.hardware.temperatures[0].current_c}°C`
                        : extra.hardware?.cpu_freq_mhz
                          ? `Clock CPU: ${extra.hardware.cpu_freq_mhz} MHz`
                          : 'Sensores indisponíveis'}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-medium">Sessões & SSH</span>
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                    </div>
                    <div className="text-xl font-bold text-white font-mono">
                      {extra.security?.logged_users?.length ?? 0} usuário(s)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {extra.security?.ssh_failed_recent
                        ? `${extra.security.ssh_failed_recent} falha(s) SSH recente(s)`
                        : 'Nenhuma falha SSH detectada'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Activity className="w-5 h-5 text-blue-400" />
                      <h3 className="text-base font-semibold text-white">Top 8 Processos (RAM / CPU)</h3>
                    </div>
                    {!extra.top_processes || extra.top_processes.length === 0 ? (
                      <p className="text-xs text-slate-500">Nenhum processo reportado.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                              <th className="py-2 pr-3">PID</th>
                              <th className="py-2 pr-3">Processo</th>
                              <th className="py-2 pr-3 text-right">CPU</th>
                              <th className="py-2 text-right">RAM</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {extra.top_processes.map((proc) => (
                              <tr key={proc.pid}>
                                <td className="py-2 pr-3 text-slate-500">{proc.pid}</td>
                                <td className="py-2 pr-3 text-slate-200 font-sans truncate max-w-[180px]">
                                  {proc.name}
                                </td>
                                <td className="py-2 pr-3 text-right text-blue-400">{proc.cpu_percent}%</td>
                                <td className="py-2 text-right text-emerald-400">
                                  {proc.memory_mb} MB ({proc.memory_percent}%)
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
                    <div className="flex items-center gap-2.5">
                      <Network className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-base font-semibold text-white">Rede & Conexões TCP</h3>
                    </div>

                    {extra.network_connections && (
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="text-lg font-bold text-emerald-400 font-mono">
                            {extra.network_connections.established}
                          </div>
                          <div className="text-[11px] text-slate-400">ESTABLISHED</div>
                        </div>
                        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="text-lg font-bold text-amber-400 font-mono">
                            {extra.network_connections.time_wait}
                          </div>
                          <div className="text-[11px] text-slate-400">TIME_WAIT</div>
                        </div>
                        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="text-lg font-bold text-blue-400 font-mono">
                            {extra.network_connections.listen}
                          </div>
                          <div className="text-[11px] text-slate-400">LISTEN</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="text-xs font-medium text-slate-400 block mb-2">Portas TCP em escuta:</span>
                      {!extra.network_connections?.listening_ports?.length ? (
                        <p className="text-xs text-slate-500">
                          Nenhuma porta listada ou requer privilégio elevado.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {extra.network_connections.listening_ports.map((item, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-blue-300"
                            >
                              :{item.port}
                              {item.process ? <span className="text-slate-400"> ({item.process})</span> : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                Aguardando próxima coleta do agente para exibir telemetria detalhada...
              </div>
            )}
          </div>
        )}

        {activeTab === 'containers' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Containers Docker</span>
                  <Box className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">{rawContainers.length}</div>
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                  <span className="text-emerald-400 font-semibold">{runningContainersCount} ativos</span> •
                  <span className="text-slate-500">{exitedContainersCount} parados</span>
                  {restartingContainersCount > 0 && (
                    <> • <span className="text-amber-400 font-semibold">{restartingContainersCount} reiniciando</span></>
                  )}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Aplicações PM2</span>
                  <Layers className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">{rawPm2Apps.length}</div>
                <p className="text-[11px] text-slate-400 mt-1">
                  <span className="text-emerald-400 font-semibold">{pm2OnlineCount} online</span>
                  {rawPm2Apps.length - pm2OnlineCount > 0 && (
                    <span className="text-rose-400 ml-1">({rawPm2Apps.length - pm2OnlineCount} offline)</span>
                  )}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Restarts no PM2</span>
                  <RefreshCw className="w-4 h-4 text-amber-400" />
                </div>
                <div className={`text-2xl font-bold font-mono ${pm2TotalRestarts > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {pm2TotalRestarts}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Total acumulado de reinícios</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Status do Daemon Docker</span>
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-sm font-semibold text-white mt-1 flex items-center gap-2">
                  {rawContainers.length > 0 || (servicesList.find((s) => s.name === 'docker')?.running) ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-emerald-400">Operacional</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                      <span className="text-slate-400">Não detectado / Sem containers</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Monitorado via Docker CLI</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                    <Box className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Containers Docker</h3>
                    <p className="text-xs text-slate-400">
                      Rastreamento automático de imagens, portas expostas e ciclos de vida.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou imagem..."
                      value={containerSearch}
                      onChange={(e) => setContainerSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-52 font-mono"
                    />
                  </div>

                  <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                    <button
                      type="button"
                      onClick={() => setContainerFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                        containerFilter === 'all'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Todos ({rawContainers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setContainerFilter('running')}
                      className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                        containerFilter === 'running'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Ativos ({runningContainersCount})
                    </button>
                    {restartingContainersCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setContainerFilter('restarting')}
                        className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                          containerFilter === 'restarting'
                            ? 'bg-amber-600 text-white'
                            : 'text-amber-400 hover:text-white'
                        }`}
                      >
                        Reiniciando ({restartingContainersCount})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setContainerFilter('exited')}
                      className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                        containerFilter === 'exited'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Parados ({exitedContainersCount})
                    </button>
                  </div>
                </div>
              </div>

              {rawContainers.length === 0 ? (
                <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
                  <Box className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-slate-300">Nenhum container Docker detectado</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    Se você possui Docker instalado nesta máquina, inicie um container (ex:{' '}
                    <code className="text-blue-400 font-mono">docker run -d -p 80:80 nginx</code>) e ele aparecerá aqui
                    automaticamente no próximo ciclo de métricas.
                  </p>
                </div>
              ) : filteredContainers.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 border border-slate-800 rounded-xl">
                  Nenhum container corresponde à busca &quot;{containerSearch}&quot;.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Container</th>
                        <th className="py-3 px-4 font-semibold">Imagem</th>
                        <th className="py-3 px-4 font-semibold">Portas Mapeadas</th>
                        <th className="py-3 px-4 font-semibold text-right">Uptime / Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/60 font-mono">
                      {filteredContainers.map((c, idx) => {
                        const stateLower = (c.state || '').toLowerCase();
                        const statusLower = (c.status || '').toLowerCase();
                        const isRestarting = stateLower === 'restarting' || statusLower.includes('restarting');
                        const isRunning = stateLower === 'running' && !isRestarting;

                        return (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4">
                              {isRunning ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                  Running
                                </span>
                              ) : isRestarting ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                                  Restarting
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800/80 text-slate-400 border border-slate-700/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                  Exited
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 font-sans">
                              <div className="font-semibold text-white flex items-center gap-2">
                                <span>{c.name}</span>
                                {c.id && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyId(c.id!)}
                                    className="text-[10px] font-mono text-slate-500 hover:text-blue-300 flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 transition-colors"
                                    title="Copiar ID do container"
                                  >
                                    {copiedId === c.id ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                    {c.id}
                                  </button>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-blue-300 font-mono text-xs">
                              <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md">
                                {c.image}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              {c.ports ? (
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {c.ports.split(',').map((p, pIdx) => (
                                    <span
                                      key={pIdx}
                                      className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]"
                                    >
                                      {p.trim()}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-500 italic text-[11px] font-sans">Nenhuma porta exposta</span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right font-sans text-xs text-slate-400">
                              {c.status || c.state}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Aplicações Node.js gerenciadas por PM2</h3>
                    <p className="text-xs text-slate-400">
                      Consumo individual de CPU, memória RAM e contador de reinícios (restarts).
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar app PM2..."
                    value={pm2Search}
                    onChange={(e) => setPm2Search(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-52 font-mono"
                  />
                </div>
              </div>

              {rawPm2Apps.length === 0 ? (
                <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
                  <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-slate-300">Nenhuma aplicação PM2 em execução</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    O agente detecta processos gerenciados pelo PM2 automaticamente via comando{' '}
                    <code className="text-emerald-400 font-mono">pm2 jlist</code>. Se você rodar uma aplicação Node.js
                    com o PM2, ela aparecerá listada aqui.
                  </p>
                </div>
              ) : filteredPm2.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 border border-slate-800 rounded-xl">
                  Nenhuma aplicação corresponde à busca &quot;{pm2Search}&quot;.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Aplicação</th>
                        <th className="py-3 px-4 font-semibold">Consumo de CPU</th>
                        <th className="py-3 px-4 font-semibold">Memória RAM</th>
                        <th className="py-3 px-4 font-semibold text-right">Contagem de Restarts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/60 font-mono">
                      {filteredPm2.map((app, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-sans">
                            {app.status === 'online' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                Online
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                {app.status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <span className="font-semibold text-white">{app.name}</span>
                            {app.pm_id !== undefined && (
                              <span className="ml-2 font-mono text-slate-500 text-[11px]">#id:{app.pm_id}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                app.cpu_percent > 60
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : app.cpu_percent > 15
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-blue-500/10 text-blue-300'
                              }`}
                            >
                              {app.cpu_percent}%
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-emerald-400 font-semibold">{app.memory_mb} MB</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {app.restarts > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                <RefreshCw className="w-3 h-3" />
                                {app.restarts} restarts
                              </span>
                            ) : (
                              <span className="text-slate-500 font-sans">0 (estável)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'services' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Serviços e Processos Rastreados</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    O agente testa esses daemons a cada 30 segundos usando checagem de processo ou systemctl.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenConfigModal}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Gerenciar Serviços
                </button>
              </div>

              {servicesList.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  Nenhum serviço reportado pelo agente ainda.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {servicesList.map((srv, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white font-mono">{srv.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        {srv.running ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 className="w-4 h-4" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                            <XCircle className="w-4 h-4" /> Inativo
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-400" />
                  Personalizar Serviços da VPS
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Defina os nomes de processos ou serviços monitorados nesta máquina.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>Sincronização instantânea:</strong> A VPS baixa esta nova lista automaticamente no próximo envio
                de métricas (em até 30s). Não é necessário reiniciar o serviço nem acessar via SSH.
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Serviços Ativos ({servicesListConfig.length})
              </label>
              {servicesListConfig.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">Nenhum serviço adicionado.</p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  {servicesListConfig.map((srv) => (
                    <span
                      key={srv}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-lg group"
                    >
                      {srv}
                      <button
                        type="button"
                        onClick={() => handleRemoveService(srv)}
                        className="text-blue-400 hover:text-rose-400 transition-colors"
                        title={`Remover ${srv}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Adicionar Novo Serviço ou Processo</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: redis, pm2, supervisor, node..."
                  value={newServiceInput}
                  onChange={(e) => setNewServiceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddService();
                    }
                  }}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleAddService()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] text-slate-400 block font-medium">Sugestões rápidas:</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_SERVICES.map((preset) => {
                  const alreadyAdded = servicesListConfig.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => handleAddService(preset)}
                      className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-all ${
                        alreadyAdded
                          ? 'bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed opacity-50'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-blue-600 hover:text-white hover:border-blue-500'
                      }`}
                    >
                      + {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {saveError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">
                {saveError}
              </p>
            )}

            {saveSuccess && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4" />
                Configurações salvas com sucesso! Sincronizando com a VPS...
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingServices || saveSuccess}
                onClick={handleSaveServices}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
              >
                {savingServices ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Configurações'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <UpdateAgentModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        server={server}
        release={agentRelease}
      />
    </div>
  );
}

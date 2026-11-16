'use client';

import React, { useEffect, useState, use } from 'react';
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

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const serverId = resolvedParams.id;
  const { currentOrganization } = useAuth();
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [agentRelease, setAgentRelease] = useState<AgentReleaseInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [servicesListConfig, setServicesListConfig] = useState<string[]>([]);
  const [newServiceInput, setNewServiceInput] = useState('');
  const [savingServices, setSavingServices] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  const fetchServer = async () => {
    if (!currentOrganization) return;
    try {
      const [data, release] = await Promise.all([
        serversService.getServer(currentOrganization.id, serverId),
        serversService.getAgentRelease().catch(() => null),
      ]);
      setServer(data);
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
    const currentList = server?.monitored_services && server.monitored_services.length > 0
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

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title={`Telemetria: ${server.name}`} />

      <main className="flex-1 p-8 space-y-8">

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
              <span className="block">Uptime: <strong className="text-white">{formatUptime(server.uptime_seconds)}</strong></span>
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
              {server.last_communication_at
                ? formatTimeBR(server.last_communication_at)
                : 'Aguardando'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Transmissão contínua a cada 30s</p>
          </div>
        </div>

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
                Configurar Serviços
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

            <div className="mt-4 pt-4 border-t border-slate-800/80">
              <div className="text-[11px] text-slate-400 mb-2 flex items-center justify-between">
                <span>Rastreamento ativo no agente:</span>
                <span className="text-slate-500 font-mono">
                  {(server.monitored_services || []).length} monitorado(s)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(server.monitored_services || ['nginx', 'docker', 'postgres', 'mysqld', 'apache2']).map(
                  (srvName, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-[11px] font-mono bg-slate-800 text-slate-300 rounded border border-slate-700/60"
                    >
                      {srvName}
                    </span>
                  )
                )}
              </div>
            </div>
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
                  <span className="text-xs font-medium">Hardware & Energia</span>
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
                  <h3 className="text-base font-semibold text-white">Top Processos (RAM / CPU)</h3>
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
                            <td className="py-2 pr-3 text-slate-200 font-sans truncate max-w-[180px]">{proc.name}</td>
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
                  <h3 className="text-base font-semibold text-white">Rede & Portas Abertas (Listening)</h3>
                </div>

                {extra.network_connections && (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                      <div className="text-lg font-bold text-emerald-400 font-mono">
                        {extra.network_connections.established}
                      </div>
                      <div className="text-[11px] text-slate-400">Ativas (ESTABLISHED)</div>
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
                      <div className="text-[11px] text-slate-400">Escutando (LISTEN)</div>
                    </div>
                  </div>
                )}

                <div>
                  <span className="text-xs font-medium text-slate-400 block mb-2">Portas TCP em escuta:</span>
                  {!extra.network_connections?.listening_ports?.length ? (
                    <p className="text-xs text-slate-500">Nenhuma porta listada (requer permissão do SO ou sem portas abertas).</p>
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

                {extra.security?.logged_users && extra.security.logged_users.length > 0 && (
                  <div className="pt-3 border-t border-slate-800">
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-2">
                      <Users className="w-3.5 h-3.5" /> Usuários logados na máquina:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {extra.security.logged_users.map((u, idx) => (
                        <span key={idx} className="px-2.5 py-1 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-300">
                          {u.name} ({u.host})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {((extra.pm2_apps && extra.pm2_apps.length > 0) ||
              (extra.docker_containers && extra.docker_containers.length > 0)) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {extra.pm2_apps && extra.pm2_apps.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Layers className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-base font-semibold text-white">Aplicações PM2</h3>
                    </div>
                    <div className="space-y-2.5">
                      {extra.pm2_apps.map((app, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-white">{app.name}</span>
                            <span className="ml-2 text-slate-500 font-mono">Restarts: {app.restarts}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-slate-300">{app.memory_mb} MB</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                app.status === 'online'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                              }`}
                            >
                              {app.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {extra.docker_containers && extra.docker_containers.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Box className="w-5 h-5 text-blue-400" />
                      <h3 className="text-base font-semibold text-white">Containers Docker</h3>
                    </div>
                    <div className="space-y-2.5">
                      {extra.docker_containers.map((c, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 pr-3">
                            <span className="font-semibold text-white block truncate">{c.name}</span>
                            <span className="text-[11px] font-mono text-slate-500 block truncate">{c.image}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono shrink-0 ${
                              c.state === 'running'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {c.status || c.state}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
            Telemetria avançada (Top Processos, Swap, Disco I/O, Portas Abertas, PM2, Docker, Bateria e Segurança) aparecerá automaticamente aqui na próxima coleta do agente atualizado.
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

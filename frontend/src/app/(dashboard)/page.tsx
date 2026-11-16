'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/ui/MetricCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Server as ServerIcon, Globe, AlertOctagon, Activity, ArrowUpRight, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { serversService } from '@/services/servers.service';
import { monitorsService } from '@/services/monitors.service';
import { incidentsService } from '@/services/incidents.service';
import { Server } from '@/types/server';
import { Monitor } from '@/types/monitor';
import { Incident } from '@/types/incident';

export default function DashboardPage() {
  const { currentOrganization } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const [serversData, monitorsData, incidentsData] = await Promise.all([
        serversService.listServers(currentOrganization.id),
        monitorsService.listMonitors(currentOrganization.id),
        incidentsService.listIncidents(currentOrganization.id),
      ]);
      setServers(serversData);
      setMonitors(monitorsData);
      setIncidents(incidentsData);
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); 
    return () => clearInterval(interval);
  }, [currentOrganization]);

  const onlineServers = servers.filter((s) => s.status === 'online').length;
  const upMonitors = monitors.filter((m) => m.status === 'up').length;
  const activeIncidents = incidents.filter((i) => i.status === 'open').length;

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Visão Geral da Infraestrutura" />

      <main className="flex-1 p-8 space-y-8">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Monitoramento em Tempo Real
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Organização: <span className="text-slate-200 font-medium">{currentOrganization?.name}</span>
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Atualizar
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricCard
            title="Servidores (VPS)"
            value={`${onlineServers} / ${servers.length}`}
            subtitle={onlineServers === servers.length && servers.length > 0 ? 'Todos operando normalmente' : `${servers.length - onlineServers} fora do ar ou pendentes`}
            icon={ServerIcon}
            variant={onlineServers === servers.length && servers.length > 0 ? 'success' : 'default'}
          />
          <MetricCard
            title="Monitores Externos"
            value={`${upMonitors} / ${monitors.length}`}
            subtitle={upMonitors === monitors.length && monitors.length > 0 ? '100% de disponibilidade' : `${monitors.length - upMonitors} com instabilidade`}
            icon={Globe}
            variant={upMonitors === monitors.length && monitors.length > 0 ? 'success' : 'default'}
          />
          <MetricCard
            title="Incidentes Ativos"
            value={activeIncidents}
            subtitle={activeIncidents === 0 ? 'Nenhum incidente ativo' : 'Ação imediata necessária'}
            icon={AlertOctagon}
            variant={activeIncidents === 0 ? 'success' : 'danger'}
          />
          <MetricCard
            title="Telemetria"
            value="30s"
            subtitle="Intervalo padrão de coleta"
            icon={Activity}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <ServerIcon className="w-5 h-5 text-blue-400" />
                  <h3 className="text-base font-semibold text-white">Servidores Recentes</h3>
                </div>
                <Link
                  href="/servers"
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {servers.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                  Nenhum servidor cadastrado ainda.{' '}
                  <Link href="/servers" className="text-blue-400 hover:underline">
                    Adicionar primeiro servidor
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {servers.slice(0, 5).map((srv) => (
                    <div key={srv.id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <Link
                          href={`/servers/${srv.id}`}
                          className="font-medium text-white hover:text-blue-400 transition-colors"
                        >
                          {srv.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {srv.hostname || 'Sem hostname'} • {srv.os_name || 'Linux'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <span className="text-xs text-slate-300 font-mono">
                            CPU: {srv.last_cpu_percent !== null ? `${srv.last_cpu_percent}%` : '--'}
                          </span>
                          <span className="text-xs text-slate-500 font-mono block">
                            RAM: {srv.last_ram_percent !== null ? `${srv.last_ram_percent}%` : '--'}
                          </span>
                        </div>
                        <StatusBadge status={srv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-semibold text-white">Monitores Web & TCP</h3>
                </div>
                <Link
                  href="/monitors"
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {monitors.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                  Nenhum monitor configurado.{' '}
                  <Link href="/monitors" className="text-blue-400 hover:underline">
                    Criar primeiro monitor
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {monitors.slice(0, 5).map((mon) => (
                    <div key={mon.id} className="py-3 flex items-center justify-between text-sm">
                      <div className="truncate mr-2">
                        <span className="font-medium text-white truncate block">{mon.name}</span>
                        <p className="text-xs text-slate-500 truncate font-mono">{mon.target}</p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-xs text-slate-400 uppercase font-mono px-2 py-0.5 bg-slate-950 rounded">
                          {mon.type}
                        </span>
                        <StatusBadge status={mon.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Cpu,
  Database,
  HardDrive,
  ShieldCheck,
  AlertOctagon,
  Network,
  RefreshCw,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { serversService } from '@/services/servers.service';
import { ServerReport, ServerReportPoint } from '@/types/server';
import { formatDateBR, formatDateTimeBR, parseUtcDate } from '@/lib/date';

interface ServerReportTabProps {
  orgId?: string;
  serverId: string;
  serverName: string;
  isSharedServer: boolean;
}

type PresetKey = '7' | '15' | '30' | 'custom';

function formatDurationMinutes(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return '--';
  if (minutes < 1) return '< 1m';
  const totalMin = Math.round(minutes);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function formatDayLabelBR(isoDate: string): string {
  const dt = parseUtcDate(isoDate);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatHourLabelBR(isoDate: string): string {
  const dt = parseUtcDate(isoDate);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface DailyAggregatedRow {
  dayKey: string;
  samples: number;
  cpuAvg: number;
  cpuMax: number;
  ramAvg: number;
  ramMax: number;
  diskMax: number | null;
}

function groupSeriesByDay(series: ServerReportPoint[]): DailyAggregatedRow[] {
  const map = new Map<
    string,
    { samples: number; cpuSum: number; ramSum: number; cpuMax: number; ramMax: number; diskMax: number | null }
  >();

  for (const pt of series) {
    const dayKey = formatDayLabelBR(pt.timestamp);
    const existing = map.get(dayKey) || {
      samples: 0,
      cpuSum: 0,
      ramSum: 0,
      cpuMax: 0,
      ramMax: 0,
      diskMax: null,
    };
    existing.samples += pt.samples_count;
    existing.cpuSum += pt.cpu_avg * pt.samples_count;
    existing.ramSum += pt.ram_avg * pt.samples_count;
    existing.cpuMax = Math.max(existing.cpuMax, pt.cpu_max);
    existing.ramMax = Math.max(existing.ramMax, pt.ram_max);
    if (pt.disk_max !== null && pt.disk_max !== undefined) {
      existing.diskMax = existing.diskMax === null ? pt.disk_max : Math.max(existing.diskMax, pt.disk_max);
    }
    map.set(dayKey, existing);
  }

  return Array.from(map.entries()).map(([dayKey, v]) => ({
    dayKey,
    samples: v.samples,
    cpuAvg: v.samples > 0 ? Number((v.cpuSum / v.samples).toFixed(1)) : 0,
    cpuMax: Number(v.cpuMax.toFixed(1)),
    ramAvg: v.samples > 0 ? Number((v.ramSum / v.samples).toFixed(1)) : 0,
    ramMax: Number(v.ramMax.toFixed(1)),
    diskMax: v.diskMax !== null ? Number(v.diskMax.toFixed(1)) : null,
  }));
}

export function ServerReportTab({
  orgId,
  serverId,
  serverName,
  isSharedServer,
}: ServerReportTabProps) {
  const [preset, setPreset] = useState<PresetKey>('30');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(Date.now() - 30 * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const [report, setReport] = useState<ServerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async (
    targetPreset: PresetKey = preset,
    startVal: string = customStart,
    endVal: string = customEnd
  ) => {
    if (!isSharedServer && !orgId) return;
    setLoading(true);
    setError(null);

    try {
      const params =
        targetPreset === 'custom'
          ? { startDate: startVal, endDate: endVal }
          : { days: Number(targetPreset) };

      const data = isSharedServer
        ? await serversService.getSharedServerReport(serverId, params)
        : await serversService.getServerReport(orgId!, serverId, params);

      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Erro ao gerar relatório do servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (preset !== 'custom') {
      loadReport(preset);
    }
  }, [preset, serverId, orgId, isSharedServer]);

  const handleCustomApply = (e: React.FormEvent) => {
    e.preventDefault();
    loadReport('custom', customStart, customEnd);
  };

  const dailyRows = useMemo(() => {
    if (!report) return [];
    return groupSeriesByDay(report.series);
  }, [report]);

  const chartData = useMemo(() => {
    if (!report) return [];
    if (report.series.length > 72) {
      return dailyRows.map((d) => ({
        label: d.dayKey,
        cpuAvg: d.cpuAvg,
        cpuMax: d.cpuMax,
        ramAvg: d.ramAvg,
      }));
    }
    return report.series.map((pt) => ({
      label: formatHourLabelBR(pt.timestamp),
      cpuAvg: pt.cpu_avg,
      cpuMax: pt.cpu_max,
      ramAvg: pt.ram_avg,
    }));
  }, [report, dailyRows]);

  const handleExportCsv = () => {
    if (!report) return;
    const escapeCsv = (val: unknown) => {
      const str = String(val ?? '');
      return `"${str.replace(/"/g, '""')}"`;
    };

    const lines: string[] = [];
    lines.push(['Relatório de Infraestrutura - Sentinel Monitor'].map(escapeCsv).join(';'));
    lines.push(['Servidor', report.server_name].map(escapeCsv).join(';'));
    lines.push(['Hostname', report.hostname || '--'].map(escapeCsv).join(';'));
    lines.push(
      ['Período (Horário BR)', `${formatDateTimeBR(report.period_start)} até ${formatDateTimeBR(report.period_end)}`]
        .map(escapeCsv)
        .join(';')
    );
    lines.push(['Disponibilidade (SLA)', `${report.summary.uptime_percent}%`].map(escapeCsv).join(';'));
    lines.push(
      ['CPU Média / Mín / Pico', `${report.summary.cpu_avg}% / ${report.summary.cpu_min}% / ${report.summary.cpu_max}%`]
        .map(escapeCsv)
        .join(';')
    );
    lines.push(
      ['RAM Média / Mín / Pico', `${report.summary.ram_avg}% / ${report.summary.ram_min}% / ${report.summary.ram_max}%`]
        .map(escapeCsv)
        .join(';')
    );
    lines.push('');

    lines.push(
      [
        'Data/Hora (BR)',
        'Amostras',
        'CPU Média (%)',
        'CPU Mín (%)',
        'CPU Pico (%)',
        'RAM Média (%)',
        'RAM Mín (%)',
        'RAM Pico (%)',
        'Disco Médio (%)',
        'Disco Máx (%)',
        'Download Médio (KB/s)',
        'Upload Médio (KB/s)',
      ]
        .map(escapeCsv)
        .join(';')
    );

    for (const pt of report.series) {
      lines.push(
        [
          formatDateTimeBR(pt.timestamp),
          pt.samples_count,
          pt.cpu_avg,
          pt.cpu_min,
          pt.cpu_max,
          pt.ram_avg,
          pt.ram_min,
          pt.ram_max,
          pt.disk_avg ?? '',
          pt.disk_max ?? '',
          pt.net_recv_kbps_avg ?? '',
          pt.net_sent_kbps_avg ?? '',
        ]
          .map(escapeCsv)
          .join(';')
      );
    }

    if (report.incidents.length > 0) {
      lines.push('');
      lines.push(['Incidentes no Período'].map(escapeCsv).join(';'));
      lines.push(['Início (BR)', 'Resolvido (BR)', 'Duração (min)', 'Severidade', 'Status', 'Título'].map(escapeCsv).join(';'));
      for (const inc of report.incidents) {
        lines.push(
          [
            formatDateTimeBR(inc.started_at),
            inc.resolved_at ? formatDateTimeBR(inc.resolved_at) : 'Em aberto',
            inc.duration_minutes ?? '',
            inc.severity,
            inc.status,
            inc.title,
          ]
            .map(escapeCsv)
            .join(';')
        );
      }
    }

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = serverName.toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    link.href = url;
    link.download = `relatorio-${safeName}-${report.period_days}d.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2 text-xs font-semibold text-slate-300">
            <Calendar className="w-4 h-4 text-blue-400" />
            Período:
          </div>
          {[
            { key: '7' as PresetKey, label: '7 dias' },
            { key: '15' as PresetKey, label: '15 dias' },
            { key: '30' as PresetKey, label: '1 Mês (30d)' },
            { key: 'custom' as PresetKey, label: 'Personalizado' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPreset(item.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                preset === item.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!report || loading}
            className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Exportar CSV / Excel
          </button>
          <button
            type="button"
            onClick={handlePrintPdf}
            disabled={!report || loading}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            Exportar PDF
          </button>
        </div>
      </div>

      {preset === 'custom' && (
        <form
          onSubmit={handleCustomApply}
          className="print:hidden bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-end gap-3"
        >
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Data Inicial</label>
            <input
              type="date"
              required
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Data Final</label>
            <input
              type="date"
              required
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors shrink-0"
          >
            Gerar Relatório
          </button>
        </form>
      )}

      {loading && (
        <div className="print:hidden bg-slate-900 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          Consolidando métricas e incidentes do período...
        </div>
      )}

      {error && !loading && (
        <div className="print:hidden bg-rose-950/50 border border-rose-800/80 rounded-2xl p-4 text-xs text-rose-300">
          {error}
        </div>
      )}

      {report && !loading && (
        <>
          <div className="print:hidden space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 px-1">
              <span>
                Janela analisada:{' '}
                <strong className="text-slate-200">{formatDateTimeBR(report.period_start)}</strong> até{' '}
                <strong className="text-slate-200">{formatDateTimeBR(report.period_end)}</strong>
              </span>
              <span className="font-mono text-slate-400">
                {report.summary.total_samples.toLocaleString('pt-BR')} coletas processadas
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Disponibilidade (SLA)</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">
                  {report.summary.uptime_percent}%
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Offline: {formatDurationMinutes(report.summary.total_downtime_minutes)} • {report.summary.incidents_count} incidente(s)
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">CPU no Período</span>
                  <Cpu className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">
                  {report.summary.cpu_avg}% <span className="text-xs font-normal text-slate-400">média</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Mín: {report.summary.cpu_min}% • Pico:{' '}
                  <strong className="text-amber-300">{report.summary.cpu_max}%</strong>
                  {report.summary.cpu_peak_at && (
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      Pico em {formatDateTimeBR(report.summary.cpu_peak_at)}
                    </span>
                  )}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Memória RAM</span>
                  <Database className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">
                  {report.summary.ram_avg}% <span className="text-xs font-normal text-slate-400">média</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Mín: {report.summary.ram_min}% • Pico:{' '}
                  <strong className="text-emerald-300">{report.summary.ram_max}%</strong>
                  {report.summary.ram_peak_at && (
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      Pico em {formatDateTimeBR(report.summary.ram_peak_at)}
                    </span>
                  )}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Disco & Rede</span>
                  <HardDrive className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">
                  {report.summary.disk_max ?? report.summary.disk_current ?? '--'}%{' '}
                  <span className="text-xs font-normal text-slate-400">pico disco</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                  <Network className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>
                    ↓ {report.summary.net_recv_kbps_avg ?? 0} / ↑ {report.summary.net_sent_kbps_avg ?? 0} KB/s (méd)
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Tendência Histórica de CPU & Memória
                  </h3>
                  <p className="text-xs text-slate-400">
                    {report.series.length > 72
                      ? 'Consolidado diário exibindo médias e picos máximos ao longo do período'
                      : 'Consolidado por hora ao longo do período selecionado'}
                  </p>
                </div>
              </div>

              {chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  Ainda não há dados consolidados para este intervalo.
                </div>
              ) : (
                <div className="w-full h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="repCpuAvg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="repRamAvg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                        formatter={(value: any, name: any) => {
                          if (name === 'cpuAvg') return [`${value}%`, 'CPU Média'];
                          if (name === 'cpuMax') return [`${value}%`, 'CPU Pico'];
                          return [`${value}%`, 'RAM Média'];
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => {
                          if (value === 'cpuAvg') return 'CPU Média (%)';
                          if (value === 'cpuMax') return 'CPU Pico (%)';
                          return 'RAM Média (%)';
                        }}
                      />
                      <Area type="monotone" dataKey="cpuMax" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
                      <Area type="monotone" dataKey="cpuAvg" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#repCpuAvg)" />
                      <Area type="monotone" dataKey="ramAvg" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#repRamAvg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-rose-400" />
                  <h3 className="text-base font-semibold text-white">
                    Incidentes Registrados no Período ({report.incidents.length})
                  </h3>
                </div>
              </div>

              {report.incidents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  Nenhum incidente registrado neste intervalo. Operação 100% estável!
                </div>
              ) : (
                <>
                  <div className="md:hidden divide-y divide-slate-800/80">
                    {report.incidents.map((inc) => (
                      <div key={inc.id} className="py-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{inc.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase shrink-0 ${
                              inc.status === 'resolved'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                                : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                            }`}
                          >
                            {inc.status === 'resolved' ? 'Resolvido' : inc.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatDateTimeBR(inc.started_at)}
                          </span>
                          <span>Duração: {formatDurationMinutes(inc.duration_minutes)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                          <th className="py-3 px-4">Ocorrência</th>
                          <th className="py-3 px-4">Início (BR)</th>
                          <th className="py-3 px-4">Recuperado (BR)</th>
                          <th className="py-3 px-4">Duração</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {report.incidents.map((inc) => (
                          <tr key={inc.id} className="hover:bg-slate-800/30">
                            <td className="py-3 px-4 font-medium text-white">{inc.title}</td>
                            <td className="py-3 px-4 font-mono text-slate-400">{formatDateTimeBR(inc.started_at)}</td>
                            <td className="py-3 px-4 font-mono text-slate-400">
                              {inc.resolved_at ? formatDateTimeBR(inc.resolved_at) : '--'}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300">
                              {formatDurationMinutes(inc.duration_minutes)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                  inc.status === 'resolved'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                                    : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                                }`}
                              >
                                {inc.status === 'resolved' ? 'Resolvido' : inc.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="hidden print:block bg-white text-slate-900 p-6 space-y-6">
            <div className="border-b-2 border-slate-800 pb-4 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Relatório Executivo de Infraestrutura • Sentinel Monitor
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Servidor: <strong>{report.server_name}</strong> ({report.hostname || 'Host'}) •{' '}
                  {report.os_name || 'Sistema'} {report.os_version || ''}
                </p>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>
                  Período: <strong>{formatDateBR(report.period_start)}</strong> a{' '}
                  <strong>{formatDateBR(report.period_end)}</strong>
                </div>
                <div>Emitido em: {formatDateTimeBR(new Date())}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="border border-slate-300 rounded-lg p-3">
                <div className="text-[11px] uppercase text-slate-500 font-semibold">Disponibilidade (SLA)</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{report.summary.uptime_percent}%</div>
                <div className="text-[11px] text-slate-600">
                  Offline: {formatDurationMinutes(report.summary.total_downtime_minutes)}
                </div>
              </div>
              <div className="border border-slate-300 rounded-lg p-3">
                <div className="text-[11px] uppercase text-slate-500 font-semibold">CPU</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{report.summary.cpu_avg}% méd</div>
                <div className="text-[11px] text-slate-600">
                  Mín: {report.summary.cpu_min}% • Pico: {report.summary.cpu_max}%
                </div>
              </div>
              <div className="border border-slate-300 rounded-lg p-3">
                <div className="text-[11px] uppercase text-slate-500 font-semibold">Memória RAM</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{report.summary.ram_avg}% méd</div>
                <div className="text-[11px] text-slate-600">
                  Mín: {report.summary.ram_min}% • Pico: {report.summary.ram_max}%
                </div>
              </div>
              <div className="border border-slate-300 rounded-lg p-3">
                <div className="text-[11px] uppercase text-slate-500 font-semibold">Disco & Rede</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {report.summary.disk_max ?? report.summary.disk_current ?? '--'}% disco
                </div>
                <div className="text-[11px] text-slate-600">
                  ↓ {report.summary.net_recv_kbps_avg ?? 0} / ↑ {report.summary.net_sent_kbps_avg ?? 0} KB/s
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-2">Resumo Diário de Desempenho</h2>
              {dailyRows.length === 0 ? (
                <p className="text-xs text-slate-500">Sem coletas no período.</p>
              ) : (
                <table className="w-full text-left text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300">
                      <th className="py-1.5 px-2 border border-slate-300">Data (BR)</th>
                      <th className="py-1.5 px-2 border border-slate-300 text-right">Coletas</th>
                      <th className="py-1.5 px-2 border border-slate-300 text-right">CPU Média</th>
                      <th className="py-1.5 px-2 border border-slate-300 text-right">CPU Pico</th>
                      <th className="py-1.5 px-2 border border-slate-300 text-right">RAM Média</th>
                      <th className="py-1.5 px-2 border border-slate-300 text-right">RAM Pico</th>
                      <th className="py-1.5 px-2 border border-slate-300 text-right">Disco Máx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((row) => (
                      <tr key={row.dayKey}>
                        <td className="py-1 px-2 border border-slate-300 font-mono">{row.dayKey}</td>
                        <td className="py-1 px-2 border border-slate-300 text-right font-mono">{row.samples}</td>
                        <td className="py-1 px-2 border border-slate-300 text-right font-mono">{row.cpuAvg}%</td>
                        <td className="py-1 px-2 border border-slate-300 text-right font-mono">{row.cpuMax}%</td>
                        <td className="py-1 px-2 border border-slate-300 text-right font-mono">{row.ramAvg}%</td>
                        <td className="py-1 px-2 border border-slate-300 text-right font-mono">{row.ramMax}%</td>
                        <td className="py-1 px-2 border border-slate-300 text-right font-mono">
                          {row.diskMax !== null ? `${row.diskMax}%` : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-2">
                Histórico de Incidentes ({report.incidents.length})
              </h2>
              {report.incidents.length === 0 ? (
                <p className="text-xs text-slate-600">Nenhum incidente registrado no período.</p>
              ) : (
                <table className="w-full text-left text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300">
                      <th className="py-1.5 px-2 border border-slate-300">Ocorrência</th>
                      <th className="py-1.5 px-2 border border-slate-300">Início</th>
                      <th className="py-1.5 px-2 border border-slate-300">Recuperado</th>
                      <th className="py-1.5 px-2 border border-slate-300">Duração</th>
                      <th className="py-1.5 px-2 border border-slate-300">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.incidents.map((inc) => (
                      <tr key={inc.id}>
                        <td className="py-1 px-2 border border-slate-300">{inc.title}</td>
                        <td className="py-1 px-2 border border-slate-300 font-mono">{formatDateTimeBR(inc.started_at)}</td>
                        <td className="py-1 px-2 border border-slate-300 font-mono">
                          {inc.resolved_at ? formatDateTimeBR(inc.resolved_at) : '--'}
                        </td>
                        <td className="py-1 px-2 border border-slate-300 font-mono">
                          {formatDurationMinutes(inc.duration_minutes)}
                        </td>
                        <td className="py-1 px-2 border border-slate-300 uppercase">{inc.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

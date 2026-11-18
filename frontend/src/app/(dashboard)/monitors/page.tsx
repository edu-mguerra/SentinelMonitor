'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  Globe,
  Plus,
  Play,
  Trash2,
  RefreshCw,
  Lock,
  ExternalLink,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { monitorsService } from '@/services/monitors.service';
import { Monitor, MonitorType } from '@/types/monitor';
import { formatTimeBR } from '@/lib/date';

export default function MonitorsPage() {
  const { currentOrganization } = useAuth();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<MonitorType>('https');
  const [target, setTarget] = useState('');
  const [port, setPort] = useState<number | undefined>(undefined);
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [expectedStatusCode, setExpectedStatusCode] = useState(200);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchMonitors = async (silent = false) => {
    if (!currentOrganization) return;
    if (!silent) setLoading(true);
    try {
      const data = await monitorsService.listMonitors(currentOrganization.id);
      setMonitors(data);
    } catch (err) {
      console.error('Erro ao listar monitores:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitors();
    const interval = setInterval(() => fetchMonitors(true), 10000);
    return () => clearInterval(interval);
  }, [currentOrganization]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;
    setFormError(null);
    setSubmitting(true);

    try {
      let cleanTarget = target.trim();
      let cleanPort = type === 'tcp' ? port : undefined;

      if (type !== 'tcp' && !/^https?:\/\//i.test(cleanTarget)) {
        cleanTarget = `${type}://${cleanTarget}`;
      } else if (type === 'tcp' && !cleanPort && /^[^:]+:\d+$/.test(cleanTarget)) {
        const [hostPart, portPart] = cleanTarget.split(':');
        cleanTarget = hostPart.trim();
        cleanPort = Number(portPart);
      }

      await monitorsService.createMonitor(currentOrganization.id, {
        name,
        type,
        target: cleanTarget,
        port: cleanPort,
        interval_seconds: intervalSeconds,
        expected_status_code: expectedStatusCode,
      });

      setIsModalOpen(false);
      setName('');
      setTarget('');
      setPort(undefined);
      fetchMonitors();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao cadastrar monitor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualCheck = async (monitorId: string) => {
    if (!currentOrganization) return;
    setCheckingId(monitorId);
    try {
      await monitorsService.triggerCheck(currentOrganization.id, monitorId);
      await fetchMonitors();
    } catch (err: any) {
      alert(`Falha na checagem: ${err.message}`);
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async (monitorId: string) => {
    if (!currentOrganization) return;
    if (!confirm('Deseja realmente remover este monitor?')) return;

    try {
      await monitorsService.deleteMonitor(currentOrganization.id, monitorId);
      fetchMonitors();
    } catch (err: any) {
      alert(err.message || 'Erro ao deletar monitor');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Monitores Web, APIs & Portas TCP" />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Monitores de Disponibilidade</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Verificações contínuas a partir de múltiplos pontos para detectar indisponibilidades e expiração de SSL.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchMonitors()}
              className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" /> Adicionar Monitor
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {monitors.length === 0 && !loading ? (
            <div className="p-12 text-center text-slate-400">
              <Globe className="w-10 h-10 mx-auto text-slate-600 mb-3" />
              <p className="text-base font-semibold text-white">Nenhum monitor configurado</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Cadastre suas URLs ou portas de banco de dados para checagem contínua.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
              >
                Criar Meu Primeiro Monitor
              </button>
            </div>
          ) : (
            <>
              <div className="md:hidden divide-y divide-slate-800/80">
                {monitors.map((mon) => (
                  <div key={mon.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white text-sm flex items-center gap-1.5 truncate">
                          <span className="truncate">{mon.name}</span>
                          {mon.type === 'https' && <Lock className="w-3 h-3 text-emerald-400 shrink-0" />}
                        </div>
                        <div className="text-xs text-slate-400 font-mono truncate mt-0.5">
                          {mon.target}
                          {mon.port && `:${mon.port}`}
                        </div>
                      </div>
                      <StatusBadge status={mon.status} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded uppercase bg-slate-950 text-slate-300 border border-slate-800">
                          {mon.type}
                        </span>
                        <span className="font-mono text-[11px]">{mon.interval_seconds}s</span>
                        <span className="font-mono text-[11px]">
                          {mon.last_checked_at ? formatTimeBR(mon.last_checked_at) : 'Nunca'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleManualCheck(mon.id)}
                          disabled={checkingId === mon.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-400 hover:text-white bg-blue-950/40 hover:bg-blue-600 border border-blue-800/40 rounded-lg transition-all disabled:opacity-50"
                        >
                          <Play className={`w-3 h-3 ${checkingId === mon.id ? 'animate-spin' : ''}`} />
                          <span>Testar</span>
                        </button>
                        <button
                          onClick={() => handleDelete(mon.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Excluir monitor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-5">Monitor / Destino</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Intervalo</th>
                    <th className="py-3 px-4">Última Checagem</th>
                    <th className="py-3 px-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {monitors.map((mon) => (
                    <tr key={mon.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-white flex items-center gap-2">
                          {mon.name}
                          {mon.type === 'https' && <Lock className="w-3 h-3 text-emerald-400" />}
                        </div>
                        <div className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          {mon.target}
                          {mon.port && `:${mon.port}`}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md uppercase bg-slate-950 text-slate-300 border border-slate-800">
                          {mon.type}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <StatusBadge status={mon.status} />
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-300 font-mono">
                        {mon.interval_seconds}s
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-400 font-mono">
                        {mon.last_checked_at
                          ? formatTimeBR(mon.last_checked_at)
                          : 'Nunca'}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleManualCheck(mon.id)}
                            disabled={checkingId === mon.id}
                            title="Testar agora (verificação manual imediata)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-400 hover:text-white bg-blue-950/40 hover:bg-blue-600 border border-blue-800/40 rounded-lg transition-all disabled:opacity-50"
                          >
                            <Play className={`w-3 h-3 ${checkingId === mon.id ? 'animate-spin' : ''}`} />
                            <span>Testar</span>
                          </button>
                          <button
                            onClick={() => handleDelete(mon.id)}
                            title="Excluir monitor"
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-semibold text-white">Novo Monitor Externo</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 flex items-start gap-2.5 p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome do Monitor</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: API de Pagamentos"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tipo de Monitor</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as MonitorType)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="https">HTTPS (Web / API com SSL)</option>
                    <option value="http">HTTP (Web sem SSL)</option>
                    <option value="tcp">TCP (Porta / Serviço)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Intervalo</label>
                  <select
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value={30}>A cada 30 segundos</option>
                    <option value={60}>A cada 1 minuto</option>
                    <option value={300}>A cada 5 minutos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {type === 'tcp' ? 'Host ou Endereço IP' : 'URL, Domínio ou IP:Porta'}
                </label>
                <input
                  type="text"
                  required
                  value={target}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTarget(val);
                    if (type === 'tcp' && /^[^:]+:\d+$/.test(val.trim())) {
                      const [, p] = val.trim().split(':');
                      const parsed = Number(p);
                      if (parsed >= 1 && parsed <= 65535) setPort(parsed);
                    }
                  }}
                  placeholder={type === 'tcp' ? 'Ex: db.empresa.com ou 143.95.171.4:5432' : 'Ex: https://meusite.com ou 143.95.171.4:3000'}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {type === 'tcp'
                    ? 'Você pode informar apenas o IP/Host e a porta abaixo, ou colar direto IP:Porta.'
                    : 'Aceita site com domínio (https://site.com) ou sem domínio usando IP e porta (ex: 143.95.171.4:3000).'}
                </p>
              </div>

              {type === 'tcp' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Porta TCP</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={65535}
                    value={port || ''}
                    onChange={(e) => setPort(Number(e.target.value))}
                    placeholder="Ex: 5432, 3306, 22"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              )}

              {type !== 'tcp' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Código HTTP Esperado</label>
                  <input
                    type="number"
                    value={expectedStatusCode}
                    onChange={(e) => setExpectedStatusCode(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Salvar Monitor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

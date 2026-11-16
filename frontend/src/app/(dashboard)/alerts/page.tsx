'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import {
  Bell,
  Mail,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Clock,
  ShieldCheck,
  Check,
  History,
  Server as ServerIcon,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTimeBR } from '@/lib/date';
import { alertsService } from '@/services/alerts.service';
import { serversService } from '@/services/servers.service';
import { AlertChannel, AlertRule, AlertHistory } from '@/types/alert';
import { Server } from '@/types/server';

export default function AlertsPage() {
  const { currentOrganization } = useAuth();
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [rules, setRules] = useState<AlertRule | null>(null);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [serverDrafts, setServerDrafts] = useState<
    Record<
      string,
      {
        cpu_threshold: string;
        ram_threshold: string;
        disk_threshold: string;
        offline_timeout_seconds: string;
        notify_on_offline: boolean;
        notify_on_hardware: boolean;
      }
    >
  >({});
  const [savingServerId, setSavingServerId] = useState<string | null>(null);
  const [savedServerId, setSavedServerId] = useState<string | null>(null);
  const [selectedRuleTarget, setSelectedRuleTarget] = useState<string>('global');
  const [loading, setLoading] = useState(true);

  const [newEmail, setNewEmail] = useState('');
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSuccess, setRulesSuccess] = useState(false);

  const fetchAlertData = async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const [configData, historyData, serversData] = await Promise.all([
        alertsService.getConfig(currentOrganization.id),
        alertsService.getHistory(currentOrganization.id),
        serversService.listServers(currentOrganization.id),
      ]);
      setChannels(configData.channels);
      setRules(configData.rules);
      setHistory(historyData);
      setServers(serversData);
      const drafts: typeof serverDrafts = {};
      for (const s of serversData) {
        drafts[s.id] = {
          cpu_threshold: s.cpu_threshold != null ? String(s.cpu_threshold) : '',
          ram_threshold: s.ram_threshold != null ? String(s.ram_threshold) : '',
          disk_threshold: s.disk_threshold != null ? String(s.disk_threshold) : '',
          offline_timeout_seconds:
            s.offline_timeout_seconds != null ? String(s.offline_timeout_seconds) : '',
          notify_on_offline: s.notify_on_offline ?? true,
          notify_on_hardware: s.notify_on_hardware ?? true,
        };
      }
      setServerDrafts(drafts);
    } catch (err) {
      console.error('Erro ao carregar dados de alerta:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertData();
  }, [currentOrganization]);

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !newEmail.trim()) return;

    try {
      await alertsService.addChannel(currentOrganization.id, newEmail);
      setNewEmail('');
      fetchAlertData();
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar e-mail de alerta');
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!currentOrganization) return;
    try {
      await alertsService.deleteChannel(currentOrganization.id, channelId);
      fetchAlertData();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover canal');
    }
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !rules) return;

    setSavingRules(true);
    try {
      await alertsService.updateRules(currentOrganization.id, rules);
      setRulesSuccess(true);
      setTimeout(() => setRulesSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar regras');
    } finally {
      setSavingRules(false);
    }
  };

  const handleSendTest = async () => {
    if (!currentOrganization) return;
    setTestSending(true);
    setTestFeedback(null);

    try {
      const res = await alertsService.sendTestEmail(currentOrganization.id, testEmailRecipient || undefined);
      setTestFeedback({ type: 'success', message: res.message || 'E-mail de teste enviado com sucesso!' });
      fetchAlertData();
    } catch (err: any) {
      setTestFeedback({ type: 'error', message: err.message || 'Falha ao enviar e-mail de teste.' });
    } finally {
      setTestSending(false);
    }
  };

  const handleSaveServerRules = async (serverId: string) => {
    if (!currentOrganization) return;
    const draft = serverDrafts[serverId];
    if (!draft) return;

    setSavingServerId(serverId);
    try {
      const updated = await serversService.updateServer(currentOrganization.id, serverId, {
        cpu_threshold: draft.cpu_threshold.trim() ? Number(draft.cpu_threshold) : null,
        ram_threshold: draft.ram_threshold.trim() ? Number(draft.ram_threshold) : null,
        disk_threshold: draft.disk_threshold.trim() ? Number(draft.disk_threshold) : null,
        offline_timeout_seconds: draft.offline_timeout_seconds.trim()
          ? Number(draft.offline_timeout_seconds)
          : null,
        notify_on_offline: draft.notify_on_offline,
        notify_on_hardware: draft.notify_on_hardware,
      });
      setServers((prev) => prev.map((s) => (s.id === serverId ? updated : s)));
      setSavedServerId(serverId);
      setTimeout(() => setSavedServerId(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar limites do servidor');
    } finally {
      setSavingServerId(null);
    }
  };

  const handleResetServerRules = async (serverId: string) => {
    if (!currentOrganization) return;
    setSavingServerId(serverId);
    try {
      const updated = await serversService.updateServer(currentOrganization.id, serverId, {
        cpu_threshold: null,
        ram_threshold: null,
        disk_threshold: null,
        offline_timeout_seconds: null,
        notify_on_offline: true,
        notify_on_hardware: true,
      });
      setServers((prev) => prev.map((s) => (s.id === serverId ? updated : s)));
      setServerDrafts((prev) => ({
        ...prev,
        [serverId]: {
          cpu_threshold: '',
          ram_threshold: '',
          disk_threshold: '',
          offline_timeout_seconds: '',
          notify_on_offline: true,
          notify_on_hardware: true,
        },
      }));
      setSavedServerId(serverId);
      setTimeout(() => setSavedServerId(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Erro ao restaurar padrão do servidor');
    } finally {
      setSavingServerId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Configuração de Alertas por E-mail" />

      <main className="flex-1 p-8 space-y-8 max-w-5xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Notificações e Alertas Críticos</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure os destinatários e limites para avisar sua equipe no momento exato em que algo sair do ar.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Destinatários dos Alertas</h3>
              <p className="text-xs text-slate-400">E-mails que receberão os comunicados de quedas e incidentes.</p>
            </div>
          </div>

          <form onSubmit={handleAddChannel} className="flex gap-3 mb-5">
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Adicionar e-mail (ex: devops@empresa.com)"
              className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shrink-0"
            >
              <Plus className="w-4 h-4" /> Adicionar E-mail
            </button>
          </form>

          {channels.length === 0 ? (
            <div className="p-4 bg-slate-950/60 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
              Nenhum e-mail adicional cadastrado. O sistema enviará notificações para o e-mail do proprietário da conta como padrão.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {channels.map((ch) => (
                <div key={ch.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="font-mono text-white text-xs">{ch.destination}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteChannel(ch.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {rules && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Gatilhos e Limites de Alerta</h3>
                  <p className="text-xs text-slate-400">
                    Escolha se deseja configurar o padrão geral ou personalizar um servidor específico.
                  </p>
                </div>
              </div>

              <div className="sm:w-72">
                <select
                  value={selectedRuleTarget}
                  onChange={(e) => setSelectedRuleTarget(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="global">Padrão Global da Organização</option>
                  {servers.map((srv) => {
                    const isCustom =
                      srv.cpu_threshold != null ||
                      srv.ram_threshold != null ||
                      srv.disk_threshold != null ||
                      srv.offline_timeout_seconds != null ||
                      srv.notify_on_offline === false ||
                      srv.notify_on_hardware === false;
                    return (
                      <option key={srv.id} value={srv.id}>
                        Servidor: {srv.name} ({isCustom ? 'Personalizado' : 'Usando Padrão'})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {selectedRuleTarget === 'global' ? (
              <form onSubmit={handleSaveRules} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Limite de CPU: <span className="font-mono text-blue-400 font-bold">{rules.cpu_threshold}%</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="99"
                      value={rules.cpu_threshold}
                      onChange={(e) => setRules({ ...rules, cpu_threshold: Number(e.target.value) })}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Alerta quando a CPU ultrapassar esse valor</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Limite de RAM: <span className="font-mono text-emerald-400 font-bold">{rules.ram_threshold}%</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="99"
                      value={rules.ram_threshold}
                      onChange={(e) => setRules({ ...rules, ram_threshold: Number(e.target.value) })}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Alerta quando o consumo de RAM for crítico</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Limite de Disco: <span className="font-mono text-amber-400 font-bold">{rules.disk_threshold}%</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="99"
                      value={rules.disk_threshold}
                      onChange={(e) => setRules({ ...rules, disk_threshold: Number(e.target.value) })}
                      className="w-full accent-amber-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Alerta quando qualquer partição lotar</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Tempo sem sinal da VPS (Timeout de Queda)
                    </label>
                    <select
                      value={rules.server_offline_timeout_seconds}
                      onChange={(e) =>
                        setRules({ ...rules, server_offline_timeout_seconds: Number(e.target.value) })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value={60}>60 segundos sem sinal</option>
                      <option value={90}>90 segundos sem sinal</option>
                      <option value={120}>2 minutos sem sinal (Recomendado)</option>
                      <option value={300}>5 minutos sem sinal</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3 pt-6">
                    <input
                      type="checkbox"
                      id="recovery_toggle"
                      checked={rules.notify_on_recovery}
                      onChange={(e) => setRules({ ...rules, notify_on_recovery: e.target.checked })}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <label htmlFor="recovery_toggle" className="text-xs text-slate-300 cursor-pointer">
                      Enviar e-mail automático quando o serviço for <strong>restabelecido</strong>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  {rulesSuccess ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> Regras padrão salvas com sucesso!
                    </span>
                  ) : (
                    <span />
                  )}

                  <button
                    type="submit"
                    disabled={savingRules}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    {savingRules ? 'Salvando...' : 'Salvar Regras Padrão'}
                  </button>
                </div>
              </form>
            ) : (() => {
              const srv = servers.find((s) => s.id === selectedRuleTarget);
              const draft = srv ? serverDrafts[srv.id] : undefined;
              if (!srv || !draft) return null;

              const effectiveCpu = draft.cpu_threshold !== '' ? Number(draft.cpu_threshold) : rules.cpu_threshold;
              const effectiveRam = draft.ram_threshold !== '' ? Number(draft.ram_threshold) : rules.ram_threshold;
              const effectiveDisk = draft.disk_threshold !== '' ? Number(draft.disk_threshold) : rules.disk_threshold;
              const effectiveTimeout =
                draft.offline_timeout_seconds !== ''
                  ? Number(draft.offline_timeout_seconds)
                  : rules.server_offline_timeout_seconds;

              const hasCustom =
                srv.cpu_threshold != null ||
                srv.ram_threshold != null ||
                srv.disk_threshold != null ||
                srv.offline_timeout_seconds != null ||
                srv.notify_on_offline === false ||
                srv.notify_on_hardware === false;

              return (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs">
                    <div className="flex items-center gap-2">
                      <ServerIcon className="w-4 h-4 text-blue-400" />
                      <span className="font-semibold text-white">{srv.name}</span>
                      <span className="font-mono text-slate-500">({srv.hostname || srv.os_name || 'Aguardando agente'})</span>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                        hasCustom
                          ? 'bg-purple-950/60 text-purple-300 border-purple-700/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {hasCustom ? 'Regra Personalizada Ativa' : 'Seguindo Padrão da Organização'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Limite de CPU:{' '}
                        <span className="font-mono text-blue-400 font-bold">{effectiveCpu}%</span>
                        {draft.cpu_threshold === '' && <span className="text-[10px] text-slate-500 ml-1">(Padrão)</span>}
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="99"
                        value={effectiveCpu}
                        onChange={(e) =>
                          setServerDrafts((prev) => ({
                            ...prev,
                            [srv.id]: { ...prev[srv.id], cpu_threshold: e.target.value },
                          }))
                        }
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Limite de RAM:{' '}
                        <span className="font-mono text-emerald-400 font-bold">{effectiveRam}%</span>
                        {draft.ram_threshold === '' && <span className="text-[10px] text-slate-500 ml-1">(Padrão)</span>}
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="99"
                        value={effectiveRam}
                        onChange={(e) =>
                          setServerDrafts((prev) => ({
                            ...prev,
                            [srv.id]: { ...prev[srv.id], ram_threshold: e.target.value },
                          }))
                        }
                        className="w-full accent-emerald-600 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Limite de Disco:{' '}
                        <span className="font-mono text-amber-400 font-bold">{effectiveDisk}%</span>
                        {draft.disk_threshold === '' && <span className="text-[10px] text-slate-500 ml-1">(Padrão)</span>}
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="99"
                        value={effectiveDisk}
                        onChange={(e) =>
                          setServerDrafts((prev) => ({
                            ...prev,
                            [srv.id]: { ...prev[srv.id], disk_threshold: e.target.value },
                          }))
                        }
                        className="w-full accent-amber-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Tempo sem sinal (Timeout de Queda)
                      </label>
                      <select
                        value={effectiveTimeout}
                        onChange={(e) =>
                          setServerDrafts((prev) => ({
                            ...prev,
                            [srv.id]: { ...prev[srv.id], offline_timeout_seconds: e.target.value },
                          }))
                        }
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                      >
                        <option value={60}>60 segundos sem sinal</option>
                        <option value={90}>90 segundos sem sinal</option>
                        <option value={120}>2 minutos sem sinal (Recomendado)</option>
                        <option value={300}>5 minutos sem sinal</option>
                        <option value={600}>10 minutos sem sinal</option>
                      </select>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.notify_on_offline}
                          onChange={(e) =>
                            setServerDrafts((prev) => ({
                              ...prev,
                              [srv.id]: { ...prev[srv.id], notify_on_offline: e.target.checked },
                            }))
                          }
                          className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                        />
                        <span>Alertar se este servidor cair (Offline)</span>
                      </label>

                      <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.notify_on_hardware}
                          onChange={(e) =>
                            setServerDrafts((prev) => ({
                              ...prev,
                              [srv.id]: { ...prev[srv.id], notify_on_hardware: e.target.checked },
                            }))
                          }
                          className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                        />
                        <span>Alertar sobrecarga de Hardware (CPU / RAM / Disco)</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
                    <div>
                      {savedServerId === srv.id && (
                        <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                          <Check className="w-4 h-4" /> Regras de {srv.name} salvas com sucesso!
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {hasCustom && (
                        <button
                          type="button"
                          onClick={() => handleResetServerRules(srv.id)}
                          disabled={savingServerId === srv.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-xl transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restaurar Padrão
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveServerRules(srv.id)}
                        disabled={savingServerId === srv.id}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                      >
                        {savingServerId === srv.id ? 'Salvando...' : `Salvar para ${srv.name}`}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-600/20 border border-amber-500/30 rounded-xl text-amber-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Testar Entrega de E-mail</h3>
              <p className="text-xs text-slate-400">
                Dispare um teste real via servidor SMTP ({currentOrganization?.name}) para conferir a caixa de entrada.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={testEmailRecipient}
              onChange={(e) => setTestEmailRecipient(e.target.value)}
              placeholder="Digite o e-mail de teste (opcional: deixe em branco para enviar a todos)"
              className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSendTest}
              disabled={testSending}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shrink-0"
            >
              <Send className={`w-4 h-4 ${testSending ? 'animate-spin' : ''}`} />
              {testSending ? 'Disparando...' : 'Enviar E-mail de Teste'}
            </button>
          </div>

          {testFeedback && (
            <div
              className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
                testFeedback.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-800/60 text-rose-300'
              }`}
            >
              {testFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{testFeedback.message}</span>
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <History className="w-5 h-5 text-slate-400" />
            <h3 className="text-base font-semibold text-white">Histórico de Disparos Recentes</h3>
          </div>

          {history.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
              Nenhuma notificação foi disparada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="py-2.5 px-3">Data/Hora</th>
                    <th className="py-2.5 px-3">Destinatário</th>
                    <th className="py-2.5 px-3">Assunto</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-3 font-mono text-slate-400">
                        {formatDateTimeBR(h.sent_at)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-white">{h.recipient}</td>
                      <td className="py-2.5 px-3 truncate max-w-xs">{h.subject}</td>
                      <td className="py-2.5 px-3 text-right">
                        {h.is_success ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40 text-[10px] font-semibold">
                            ENTREGUE
                          </span>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-800/40 text-[10px] font-semibold"
                            title={h.error_message || ''}
                          >
                            FALHOU
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

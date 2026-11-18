'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertTriangle,
  Info,
  Check,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTimeBR } from '@/lib/date';
import { incidentsService } from '@/services/incidents.service';
import { Incident, IncidentStatus } from '@/types/incident';

export default function IncidentsPage() {
  const { currentOrganization } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const fetchIncidents = async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const data = await incidentsService.listIncidents(
        currentOrganization.id,
        filter === 'all' ? undefined : filter
      );
      setIncidents(data);
    } catch (err) {
      console.error('Erro ao listar incidentes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [currentOrganization, filter]);

  const handleResolve = async (incidentId: string) => {
    if (!currentOrganization) return;
    try {
      await incidentsService.updateIncidentStatus(currentOrganization.id, incidentId, 'resolved');
      fetchIncidents();
    } catch (err: any) {
      alert(err.message || 'Erro ao resolver incidente');
    }
  };

  const handleAcknowledge = async (incidentId: string) => {
    if (!currentOrganization) return;
    try {
      await incidentsService.updateIncidentStatus(currentOrganization.id, incidentId, 'acknowledged');
      fetchIncidents();
    } catch (err: any) {
      alert(err.message || 'Erro ao reconhecer incidente');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Histórico de Incidentes & Alarmes" />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Registro de Incidentes</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Acompanhamento de indisponibilidades em tempo real com auto-recuperação documentada.
            </p>
          </div>

          <div className="flex items-center gap-3">

            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  filter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilter('open')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  filter === 'open' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Abertos
              </button>
              <button
                onClick={() => setFilter('resolved')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  filter === 'resolved' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Resolvidos
              </button>
            </div>

            <button
              onClick={fetchIncidents}
              className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {incidents.length === 0 && !loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white">Nenhum incidente registrado</h3>
            <p className="text-xs text-slate-400 mt-1">
              Todos os seus sistemas e servidores estão operando com 100% de estabilidade.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {incidents.map((inc) => {
              const isOpen = inc.status === 'open';
              const isAcknowledged = inc.status === 'acknowledged';

              let borderColor = 'border-slate-800';
              let badgeColor = 'bg-slate-800 text-slate-300';

              if (inc.severity === 'critical') {
                borderColor = isOpen ? 'border-rose-900/60 bg-rose-950/10' : 'border-slate-800';
                badgeColor = 'bg-rose-950 text-rose-400 border border-rose-800/60';
              } else if (inc.severity === 'warning') {
                badgeColor = 'bg-amber-950 text-amber-400 border border-amber-800/60';
              }

              return (
                <div
                  key={inc.id}
                  className={`border rounded-2xl p-5 bg-slate-900 transition-all ${borderColor}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full ${badgeColor}`}>
                          {inc.severity}
                        </span>
                        <h4 className="text-sm font-semibold text-white">{inc.title}</h4>
                      </div>
                      <p className="text-xs text-slate-400 whitespace-pre-line max-w-2xl">
                        {inc.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Início: {formatDateTimeBR(inc.started_at)}
                        </span>
                        {inc.resolved_at && (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Recuperado:{' '}
                            {formatDateTimeBR(inc.resolved_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="flex items-center gap-2 self-start shrink-0">
                        <button
                          onClick={() => handleAcknowledge(inc.id)}
                          className="px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-950/70 border border-amber-800/50 rounded-lg transition-colors"
                        >
                          Reconhecer
                        </button>
                        <button
                          onClick={() => handleResolve(inc.id)}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/50 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Resolver
                        </button>
                      </div>
                    )}

                    {isAcknowledged && (
                      <div className="flex items-center gap-2 self-start shrink-0">
                        <span className="text-xs text-amber-400 font-medium px-2 py-1 bg-amber-950/30 rounded border border-amber-900/40">
                          Reconhecido
                        </span>
                        <button
                          onClick={() => handleResolve(inc.id)}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/50 rounded-lg transition-colors"
                        >
                          Marcar Resolvido
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

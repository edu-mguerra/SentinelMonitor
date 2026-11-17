'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Search,
  Mail,
  UserPlus,
  CheckCircle2,
  Clock,
  Trash2,
  AlertCircle,
  Shield,
} from 'lucide-react';
import { serversService } from '@/services/servers.service';
import { Server, ServerShare, UserSearchResult } from '@/types/server';
import { formatDateBR } from '@/lib/date';

interface ServerShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: Server;
  orgId: string;
}

export function ServerShareModal({
  isOpen,
  onClose,
  server,
  orgId,
}: ServerShareModalProps) {
  const [emailInput, setEmailInput] = useState('');
  const [shares, setShares] = useState<ServerShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchShares = async () => {
    setLoading(true);
    try {
      const data = await serversService.listServerShares(orgId, server.id);
      setShares(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchShares();
      setEmailInput('');
      setFeedback(null);
      setSearchResults([]);
    }
  }, [isOpen, server.id]);

  useEffect(() => {
    if (emailInput.trim().length >= 2 && !emailInput.includes('@')) {
      const timer = setTimeout(async () => {
        setSearching(true);
        try {
          const res = await serversService.searchUsers(emailInput.trim());
          setSearchResults(res);
        } catch {
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [emailInput]);

  const handleInvite = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFeedback({ type: 'error', text: 'Informe um endereço de e-mail válido.' });
      return;
    }

    setInviting(true);
    setFeedback(null);
    try {
      const newShare = await serversService.inviteServerShare(orgId, server.id, cleanEmail);
      setShares((prev) => [newShare, ...prev]);
      setEmailInput('');
      setSearchResults([]);
      setFeedback({
        type: 'success',
        text: `Convite enviado com sucesso para ${cleanEmail}! O usuário receberá um e-mail de notificação.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Falha ao enviar convite.' });
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (shareId: string, email: string) => {
    if (!window.confirm(`Deseja revogar o acesso de ${email} a este servidor?`)) {
      return;
    }

    setRevokingId(shareId);
    setFeedback(null);
    try {
      await serversService.revokeServerShare(orgId, server.id, shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      setFeedback({ type: 'success', text: `Acesso de ${email} revogado com sucesso.` });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Falha ao revogar compartilhamento.' });
    } finally {
      setRevokingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                VPS Amiga • Compartilhar Monitoramento
              </h2>
              <p className="text-xs text-slate-400">
                Servidor: <strong className="text-white">{server.name}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-300 leading-relaxed space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-blue-300">
            <Shield className="w-4 h-4 text-blue-400" /> Como funciona a VPS Amiga:
          </div>
          <p className="text-slate-400">
            O usuário convidado aceita o convite e passa a acompanhar em tempo real o uso de CPU, RAM, Docker e PM2 desta VPS, além de <strong>receber alertas de queda e sobrecarga por e-mail</strong>.
          </p>
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
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
              className="text-slate-400 hover:text-white text-xs ml-2"
            >
              Fechar
            </button>
          </div>
        )}

        <form onSubmit={handleInvite} className="space-y-2">
          <label className="block text-xs font-medium text-slate-300">
            Pesquise o usuário ou digite o e-mail:
          </label>
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="ex: colega@empresa.com ou digite o nome..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={inviting || !emailInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 shadow-sm"
              >
                <UserPlus className={`w-3.5 h-3.5 ${inviting ? 'animate-spin' : ''}`} />
                {inviting ? 'Enviando...' : 'Convidar'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-20 overflow-hidden divide-y divide-slate-800">
                {searchResults.map((usr) => (
                  <button
                    key={usr.id}
                    type="button"
                    onClick={() => {
                      setEmailInput(usr.email);
                      setSearchResults([]);
                    }}
                    className="w-full p-2.5 text-left text-xs hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-white block">{usr.full_name || 'Usuário'}</span>
                      <span className="text-[11px] font-mono text-slate-400">{usr.email}</span>
                    </div>
                    <span className="text-[10px] text-blue-400 font-semibold px-2 py-0.5 rounded bg-blue-500/10">
                      Selecionar
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>Usuários com acesso a esta VPS ({shares.length})</span>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Carregando compartilhamentos...
            </div>
          ) : shares.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Nenhum usuário compartilhado ainda. Convide alguém acima!
            </div>
          ) : (
            <div className="space-y-2">
              {shares.map((sh) => (
                <div
                  key={sh.id}
                  className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white truncate font-mono">
                        {sh.shared_with_email}
                      </span>
                      {sh.status === 'accepted' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Conectado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                          <Clock className="w-3 h-3" /> Convite Pendente
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Enviado em {formatDateBR(sh.created_at)}
                    </span>
                  </div>

                  <button
                    onClick={() => handleRevoke(sh.id, sh.shared_with_email)}
                    disabled={revokingId === sh.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors disabled:opacity-50 shrink-0"
                    title="Revogar acesso"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

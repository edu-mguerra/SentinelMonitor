'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUpCircle, Check, CheckCircle2, Copy, ShieldCheck, Terminal, X } from 'lucide-react';
import { AgentReleaseInfo, Server } from '@/types/server';

type OsKey = 'linux' | 'macos' | 'windows';

interface UpdateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: Server | null;
  release: AgentReleaseInfo | null;
}

function detectServerOs(osName?: string): OsKey {
  const lower = (osName || '').toLowerCase();
  if (lower.includes('win')) return 'windows';
  if (lower.includes('mac') || lower.includes('darwin')) return 'macos';
  return 'linux';
}

const OS_STEPS: Record<OsKey, string[]> = {
  windows: [
    'Na máquina Windows, abra o PowerShell como Administrador (botão direito → Executar como administrador).',
    'Cole e execute o comando abaixo (ele atualiza os scripts e reinicia a tarefa SentinelMonitorAgent sem apagar sua configuração).',
    'Aguarde até 30 segundos: o painel reconhecerá automaticamente a nova versão e o aviso de atualização irá sumir.',
  ],
  linux: [
    'Acesse o terminal da sua VPS via SSH.',
    'Cole e execute o comando abaixo (ele baixa os scripts novos e reinicia o serviço systemd sem perder seu token).',
    'Em até 30 segundos o painel atualizará automaticamente a versão exibida.',
  ],
  macos: [
    'Abra o aplicativo Terminal no Mac.',
    'Cole e execute o comando abaixo (ele atualiza os scripts e reinicia o daemon no launchd sem alterar permissões de usuário).',
    'Em até 30 segundos o painel reconhecerá a nova versão automaticamente.',
  ],
};

export function UpdateAgentModal({ isOpen, onClose, server, release }: UpdateAgentModalProps) {
  const [selectedOs, setSelectedOs] = useState<OsKey>('linux');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (server) {
      setSelectedOs(detectServerOs(server.os_name));
      setCopied(false);
    }
  }, [server]);

  if (!isOpen || !server || !release) return null;

  const command = release.update_commands[selectedOs];
  const currentVersion = server.agent_version || '1.0.0';

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Atualização do Agente Disponível</h3>
              <p className="text-xs text-slate-400">
                Servidor: <strong className="text-slate-200">{server.name}</strong> ({server.hostname || server.os_name})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
          <span className="text-slate-400">
            Versão instalada:{' '}
            <code className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">v{currentVersion}</code>
          </span>
          <span className="text-slate-600">→</span>
          <span className="text-slate-300">
            Nova versão:{' '}
            <code className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50 font-mono font-bold">
              v{release.latest_version}
            </code>
          </span>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              O que há de novo nesta atualização
            </h4>
            {release.releases_history && release.releases_history.filter((r) => r.version !== currentVersion).length > 1 && (
              <span className="text-[10px] text-blue-400 bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 rounded-full font-medium">
                {release.releases_history.filter((r) => r.version !== currentVersion).length} versões acumuladas
              </span>
            )}
          </div>

          {release.releases_history && release.releases_history.filter((r) => r.version !== currentVersion).length > 1 ? (
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {release.releases_history
                .filter((r) => r.version !== currentVersion)
                .map((rel) => (
                  <div
                    key={rel.version}
                    className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-xs text-emerald-400 bg-emerald-950/80 border border-emerald-800/50 px-2 py-0.5 rounded">
                        v{rel.version}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate font-medium">
                        {rel.title || `Atualização v${rel.version}`}
                      </span>
                    </div>
                    <ul className="space-y-1 pt-1">
                      {rel.changelog.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : (
            <ul className="space-y-1.5 bg-slate-950/50 border border-slate-800/80 rounded-xl p-4">
              {release.changelog.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-blue-400" /> Passo a passo para atualizar
            </h4>
            <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(['windows', 'linux', 'macos'] as OsKey[]).map((osKey) => (
                <button
                  key={osKey}
                  type="button"
                  onClick={() => {
                    setSelectedOs(osKey);
                    setCopied(false);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition-colors ${
                    selectedOs === osKey ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {osKey === 'macos' ? 'macOS' : osKey}
                </button>
              ))}
            </div>
          </div>

          <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 pl-1">
            {OS_STEPS[selectedOs].map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <div className="relative">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-blue-300 overflow-x-auto select-all pr-24">
              {command}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={`absolute top-2.5 right-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 text-xs text-blue-200">
          <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <span>
            <strong>100% sob seu controle:</strong> O agente nunca baixa alterações em segundo plano sem sua ação. Seu token, histórico de métricas e configurações permanecem intactos.
          </span>
        </div>

        <div className="mt-5 flex justify-end pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

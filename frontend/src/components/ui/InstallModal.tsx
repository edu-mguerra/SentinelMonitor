'use client';

import React, { useState } from 'react';
import { Copy, Check, Terminal, Shield, AlertTriangle, X } from 'lucide-react';

type PlatformKey = 'linux' | 'macos' | 'windows';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  installCommand: string;
  installCommands?: {
    linux?: string;
    macos?: string;
    windows?: string;
  };
  expiresAt?: string;
}

const PLATFORM_TABS: { key: PlatformKey; label: string; description: string; securityNote: string }[] = [
  {
    key: 'linux',
    label: 'Linux',
    description: 'Execute o comando abaixo no terminal da sua VPS (Ubuntu, Debian, CentOS ou Rocky Linux):',
    securityNote: 'O agente roda isolado como usuário de sistema sem login (sentinel-agent) via systemd.',
  },
  {
    key: 'macos',
    label: 'macOS',
    description: 'Execute o comando abaixo no Terminal do Mac (requer senha de administrador para registrar o LaunchDaemon):',
    securityNote: 'Não cria nenhum usuário na tela de login. Roda nativamente em background via launchd.',
  },
  {
    key: 'windows',
    label: 'Windows',
    description: 'Abra o PowerShell como Administrador e execute o comando abaixo:',
    securityNote: 'Não cria nenhuma conta de usuário. Roda silenciosamente como serviço nativo NT AUTHORITY\\SYSTEM.',
  },
];

export function InstallModal({
  isOpen,
  onClose,
  serverName,
  installCommand,
  installCommands,
}: InstallModalProps) {
  const [selectedOs, setSelectedOs] = useState<PlatformKey>('linux');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const activeTab = PLATFORM_TABS.find((t) => t.key === selectedOs) || PLATFORM_TABS[0];

  const activeCommand =
    (selectedOs === 'linux' && (installCommands?.linux || installCommand)) ||
    (selectedOs === 'macos' &&
      (installCommands?.macos || installCommand.replace('/install.sh', '/install-mac.sh'))) ||
    (selectedOs === 'windows' && (installCommands?.windows || installCommand)) ||
    installCommand;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">

        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-950/80 border border-blue-800/40 rounded-xl text-blue-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Instalar Agente Multiplataforma</h3>
              <p className="text-xs text-slate-400">Máquina: {serverName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          {PLATFORM_TABS.map((tab) => {
            const isActive = selectedOs === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setSelectedOs(tab.key);
                  setCopied(false);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-4">
          <p className="text-sm text-slate-300">{activeTab.description}</p>

          <div className="relative">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-blue-300 overflow-x-auto select-all pr-24">
              {activeCommand}
            </div>
            <button
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

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 text-xs text-slate-300 space-y-1.5">
            <p className="font-semibold text-white">O que esta instalação faz e qual porta utiliza:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Cria um ambiente Python isolado (<code className="text-slate-300">venv</code> + <code className="text-slate-300">psutil</code>) e baixa apenas os 3 módulos do agente.</li>
              <li>
                <strong className="text-slate-200">Não abre nenhuma porta de entrada na sua máquina</strong> (zero exposição no firewall): o agente apenas envia métricas de saída a cada 30s para a porta da API do Sentinel (porta <code className="text-blue-300">10203</code> neste ambiente).
              </li>
              <li>Mantém um buffer local em disco para reenviar métricas caso a conexão oscile.</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs text-slate-300">
              <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Execução Nativa:</strong> {activeTab.securityNote}
              </span>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs text-slate-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Uso Único:</strong> O token temporário deste comando expira em 15 minutos e é invalidado após o primeiro handshake.
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
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

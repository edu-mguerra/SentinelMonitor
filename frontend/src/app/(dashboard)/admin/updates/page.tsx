'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import {
  Rocket,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  Send,
  AlertCircle,
  RefreshCw,
  X,
  ShieldCheck,
  Tag,
  ListPlus,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { adminService } from '@/services/admin.service';
import { ReleaseItem } from '@/types/server';
import { formatDateBR } from '@/lib/date';

export default function AdminUpdatesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [versionInput, setVersionInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [changelogItems, setChangelogItems] = useState<string[]>(['']);
  const [publishImmediate, setPublishImmediate] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (user && !user.is_superuser) {
      router.push('/');
    }
  }, [user, router]);

  const fetchReleases = async () => {
    setLoading(true);
    try {
      const data = await adminService.listReleases();
      setReleases(data);
    } catch (err) {
      console.error('Erro ao listar releases:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.is_superuser) {
      fetchReleases();
    }
  }, [user]);

  if (!user?.is_superuser) {
    return null;
  }

  const latestPublished = releases.find((r) => r.is_published);

  const handleOpenCreateModal = () => {
    setVersionInput('');
    setTitleInput('');
    setChangelogItems(['']);
    setPublishImmediate(false);
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const handleAddChangelogLine = () => {
    setChangelogItems([...changelogItems, '']);
  };

  const handleChangelogChange = (index: number, value: string) => {
    const updated = [...changelogItems];
    updated[index] = value;
    setChangelogItems(updated);
  };

  const handleRemoveChangelogLine = (index: number) => {
    if (changelogItems.length === 1) {
      setChangelogItems(['']);
      return;
    }
    const updated = changelogItems.filter((_, i) => i !== index);
    setChangelogItems(updated);
  };

  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanVersion = versionInput.trim().replace(/^v/i, '');
    if (!cleanVersion) {
      setFormError('Informe o número da versão (ex: 1.2.0)');
      return;
    }

    const validLines = changelogItems.map((s) => s.trim()).filter(Boolean);
    if (validLines.length === 0) {
      setFormError('Adicione pelo menos 1 item descrevendo o que há de novo na versão.');
      return;
    }

    setActionLoading(true);
    try {
      await adminService.createRelease({
        version: cleanVersion,
        title: titleInput.trim() || `Atualização v${cleanVersion}`,
        changelog: validLines,
        is_published: publishImmediate,
      });
      setIsCreateModalOpen(false);
      await fetchReleases();
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao cadastrar release');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async (id: string, version: string) => {
    const confirmed = window.confirm(
      `Deseja realmente soltar a atualização v${version} agora?\n\nAssim que você confirmar, todos os clientes com agentes em versões anteriores verão o sinal de atualização no painel.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      await adminService.publishRelease(id);
      await fetchReleases();
    } catch (err: any) {
      alert(err?.message || 'Erro ao publicar release');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string, version: string) => {
    const confirmed = window.confirm(
      `Deseja excluir a versão v${version}? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      await adminService.deleteRelease(id);
      await fetchReleases();
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir release');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Lançamento de Atualizações (Painel Master)" />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-start justify-between gap-4 shadow-sm flex-wrap">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400 shrink-0 mt-0.5">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Fila de Distribuição de Atualizações do Agente
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Cada melhoria desenvolvida no Sentinel Agent entra automaticamente nesta fila como{' '}
                <strong>Rascunho</strong>. Nenhuma máquina cliente recebe aviso até que você, como
                Master, clique em <strong>"Soltar Atualização Agora"</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenCreateModal}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-medium flex items-center gap-2 transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar Manualmente
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Versão Atual no Ar</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {latestPublished ? `v${latestPublished.version}` : 'Nenhuma ativa'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {latestPublished?.published_at
                ? `Liberada em ${formatDateBR(latestPublished.published_at)}`
                : 'Crie ou solte uma versão'}
            </p>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total de Releases</span>
              <Tag className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-white">{releases.length}</div>
            <p className="text-[11px] text-slate-500 mt-1">Histórico completo de versões cadastradas</p>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Rascunhos Pendentes</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {releases.filter((r) => !r.is_published).length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Versões prontas aguardando liberação</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Central de Distribuição de Versões</h3>
            <button
              onClick={fetchReleases}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              Carregando releases...
            </div>
          ) : releases.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-slate-900/50 border border-slate-800 rounded-2xl">
              Nenhuma versão na fila ou cadastrada.
            </div>
          ) : (
            <div className="space-y-6">

              {releases.filter((r) => !r.is_published).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                    <Clock className="w-4 h-4" />
                    <span>Prontas na Fila para Liberação (Aguardando seu comando)</span>
                  </div>

                  {releases
                    .filter((r) => !r.is_published)
                    .map((release) => (
                      <div
                        key={release.id}
                        className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/30 shadow-lg shadow-amber-500/5 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-amber-500/20">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-lg font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-xl">
                              v{release.version}
                            </span>
                            <div>
                              <h4 className="text-base font-bold text-white">
                                {release.title || `Release v${release.version}`}
                              </h4>
                              <span className="text-xs text-amber-300/80">
                                Preparada pelo desenvolvimento • Aguardando liberação do Master
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handlePublish(release.id, release.version)}
                              disabled={actionLoading}
                              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/25 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
                            >
                              <Send className="w-4 h-4" /> Soltar Atualização Agora
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(release.id, release.version)}
                              disabled={actionLoading}
                              className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                              title="Excluir da fila"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 block">
                            Melhorias inclusas nesta versão (os clientes verão isso no modal):
                          </span>
                          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
                            {release.changelog.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-xs text-slate-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Versões Liberadas no Ar</span>
                </div>

                {releases.filter((r) => r.is_published).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-xl">
                    Nenhuma versão liberada no momento. Solte uma versão da fila acima para disponibilizar aos clientes.
                  </div>
                ) : (
                  releases
                    .filter((r) => r.is_published)
                    .map((release) => {
                      const isCurrentActive = latestPublished?.id === release.id;
                      return (
                        <div
                          key={release.id}
                          className={`p-5 rounded-2xl border transition-all ${
                            isCurrentActive
                              ? 'bg-slate-900/90 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                              : 'bg-slate-900 border-slate-800'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-base font-bold text-white bg-slate-800 px-2.5 py-1 rounded-lg">
                                v{release.version}
                              </span>
                              <div>
                                <h4 className="text-sm font-semibold text-white">
                                  {release.title || `Release v${release.version}`}
                                </h4>
                                <span className="text-[11px] text-slate-400">
                                  Publicada em {formatDateBR(release.published_at || release.created_at)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                </span>
                                {isCurrentActive ? 'Ativa no Ar (Notificando Clientes)' : 'Publicada'}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleDelete(release.id, release.version)}
                                disabled={actionLoading}
                                className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                                title="Excluir do histórico"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-3.5 space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                              Changelog:
                            </span>
                            <ul className="space-y-1">
                              {release.changelog.map((item, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
                  <Rocket className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Criar Nova Versão do Agente</h3>
                  <p className="text-xs text-slate-400">
                    Defina o que há de novo antes de liberar para os clientes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRelease} className="mt-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Número da Versão <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ex: 1.2.0"
                    value={versionInput}
                    onChange={(e) => setVersionInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Título / Destaque
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Novas métricas de disco e rede"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <ListPlus className="w-3.5 h-3.5 text-blue-400" />
                    O que há de novo nesta versão (Changelog) <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddChangelogLine}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar item
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {changelogItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-mono w-4">{idx + 1}.</span>
                      <input
                        type="text"
                        placeholder="Descreva a melhoria ou correção..."
                        value={item}
                        onChange={(e) => handleChangelogChange(idx, e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveChangelogLine(idx)}
                        className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                        title="Remover linha"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-3 p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={publishImmediate}
                    onChange={(e) => setPublishImmediate(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Soltar atualização imediatamente para todos
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Se desmarcado, a versão é salva como <strong>Rascunho</strong> e você poderá
                      soltar quando quiser com um clique.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando...
                    </>
                  ) : publishImmediate ? (
                    <>
                      <Rocket className="w-3.5 h-3.5" /> Criar e Soltar Agora
                    </>
                  ) : (
                    'Salvar como Rascunho'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

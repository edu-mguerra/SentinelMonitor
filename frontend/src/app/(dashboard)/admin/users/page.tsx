'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import {
  Users,
  Mail,
  ShieldCheck,
  Crown,
  User as UserIcon,
  Calendar,
  Lock,
  Search,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateBR } from '@/lib/date';
import { adminService } from '@/services/admin.service';
import { AdminUser } from '@/types/auth';

export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user && !user.is_superuser) {
      router.push('/');
    }
  }, [user, router]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await adminService.listUsers();
      setUsers(data);
    } catch (err) {
      console.error('Erro ao listar usuários:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.is_superuser) {
      fetchUsers();
    }
  }, [user]);

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    const nameMatch = u.full_name?.toLowerCase().includes(term);
    const emailMatch = u.email.toLowerCase().includes(term);
    return nameMatch || emailMatch;
  });

  if (!user?.is_superuser) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Header title="Gestão de Usuários (Painel Master)" />

      <main className="flex-1 p-8 space-y-6 max-w-6xl">

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-start gap-3.5 shadow-sm">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400 shrink-0 mt-0.5">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Privacidade Estrita & Isolamento Multi-Tenant
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Como Administrador Master, você tem visibilidade gerencial apenas da <strong>lista de contas cadastradas (Nome e E-mail)</strong>.
              Por conformidade e privacidade estrita, os servidores, métricas de hardware, partições de disco, serviços e monitores de cada usuário são
              <strong> 100% isolados e inacessíveis para o Master</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              Total: <strong className="text-white font-mono">{users.length}</strong> usuário(s)
            </span>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3.5">Usuário / Nome</th>
                    <th className="px-6 py-3.5">E-mail</th>
                    <th className="px-6 py-3.5">Tipo de Conta</th>
                    <th className="px-6 py-3.5">Data de Cadastro</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              u.is_superuser
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {u.is_superuser ? <Crown className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="font-semibold text-white block">
                              {u.full_name || 'Sem nome informado'}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              ID: {u.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-300 font-mono text-xs">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span>{u.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {u.is_superuser ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg">
                            <Crown className="w-3 h-3" /> Master
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700 rounded-lg">
                            Usuário Cliente
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{formatDateBR(u.created_at)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                        </span>
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

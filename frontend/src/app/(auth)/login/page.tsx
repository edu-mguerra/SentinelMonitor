'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { ShieldCheck, Mail, Lock, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingApprovalMsg, setPendingApprovalMsg] = useState(false);
  const { login, loginWithGoogle } = useAuth();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('pending_approval=1')) {
      setPendingApprovalMsg(true);
    }
  }, []);

  const handleCredentialResponse = async (response: any) => {
    if (response?.credential) {
      setLoading(true);
      setError(null);
      try {
        await loginWithGoogle(response.credential);
      } catch (err: any) {
        setError(err.message || 'Falha ao autenticar com o Google.');
      } finally {
        setLoading(false);
      }
    }
  };

  const setupGoogleSignIn = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      auto_select: false,
      context: 'signin',
    });

    const container = document.getElementById('google-btn-wrapper');
    if (container) {
      container.innerHTML = '';
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 380,
      });
    }
  };

  useEffect(() => {
    if (window.google?.accounts?.id) {
      setupGoogleSignIn();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password });
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação. Verifique seu e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={setupGoogleSignIn}
      />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">

        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400 mb-3">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Sentinel Monitor</h2>
          <p className="text-sm text-slate-400 mt-1">Acesse sua plataforma de infraestrutura</p>
        </div>

        {pendingApprovalMsg && (
          <div className="mb-6 flex items-start gap-3 p-3.5 bg-amber-950/60 border border-amber-800/60 rounded-xl text-amber-300 text-xs leading-relaxed animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <strong className="block text-amber-200 font-semibold mb-0.5">Cadastro realizado com sucesso!</strong>
              Sua conta foi criada e está aguardando a aprovação do Administrador Master para ter o acesso liberado.
            </div>
          </div>
        )}

        {error && (
          <div
            className={`mb-6 flex items-start gap-3 p-3.5 rounded-xl text-xs leading-relaxed ${
              error.toLowerCase().includes('aprova')
                ? 'bg-amber-950/60 border border-amber-800/60 text-amber-300'
                : 'bg-rose-950/60 border border-rose-800/60 text-rose-300'
            }`}
          >
            <AlertCircle
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                error.toLowerCase().includes('aprova') ? 'text-amber-400' : 'text-rose-400'
              }`}
            />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">E-mail de acesso</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.nome@empresa.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Senha de acesso</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Entrando...</span>
              </>
            ) : (
              <>
                <span>Entrar no Painel</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-3 text-slate-500 font-medium">Ou continue com</span>
          </div>
        </div>

        <div className="w-full flex flex-col items-center justify-center min-h-[44px]">
          <div id="google-btn-wrapper" className="w-full flex justify-center" />
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Não tem uma conta?{' '}
          <Link href="/register" className="text-blue-400 hover:text-blue-300 font-medium">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}

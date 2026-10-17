import React from 'react';
import { Zap, ArrowUpRight } from 'lucide-react';
import { Brand } from '../WorkspaceUI';

export const LoginScreen = ({ onLogin }) => (
  <div className="login-shell">
    <section className="login-story">
      <Brand />
      <div>
        <span className="eyebrow">CONTEXTO QUE MOVE NEGÓCIOS</span>
        <h2>
          Mais preparo.
          <br />
          Melhores conversas.
        </h2>
        <p>O histórico do seu CRM, conectado à sua próxima oportunidade.</p>
        <div className="login-flow">
          <span>Dados do negócio</span>
          <ArrowUpRight size={19} />
          <span>Inteligência comercial</span>
        </div>
      </div>
      <footer>Branddi · Revenue Operations</footer>
    </section>
    <section className="login-form-area">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 text-center border border-slate-100">
        <div className="w-16 h-16 bg-branddi-cyan/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Zap size={32} className="text-branddi-cyan" fill="#001D2E" />
        </div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">CRM Intelligence</h1>
        <p className="text-slate-500 text-sm mt-2 mb-8">
          Faça login com a sua conta corporativa para acessar a inteligência de vendas da Branddi.
        </p>

        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm group"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="group-hover:text-slate-900">Continuar com Google</span>
        </button>
      </div>
      <p className="login-footnote">Acesso exclusivo à equipe Branddi.</p>
    </section>
  </div>
);

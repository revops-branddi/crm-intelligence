import React, { useState } from 'react';
import {
  Calendar, AlertTriangle, TrendingUp, MessageSquare, XCircle,
  RefreshCw, UserMinus, UserPlus, Zap, Clock
} from 'lucide-react';
import { SectionTitle } from '../ui/SectionTitle';
import { CommercialHistoryRecords } from './CommercialHistoryTab';

const tipoConfig = {
  reuniao_estagnada:       { icon: Calendar,       color: 'text-orange-500', bg: 'bg-orange-50',  border: 'border-orange-200', label: 'Reunião Estagnada' },
  engajamento_apos_silencio: { icon: TrendingUp,   color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Engajamento Retomado' },
  objecao_levantada:       { icon: AlertTriangle,   color: 'text-amber-500',  bg: 'bg-amber-50',   border: 'border-amber-200',  label: 'Objeção' },
  negativa_forte:          { icon: XCircle,         color: 'text-red-500',    bg: 'bg-red-50',     border: 'border-red-200',    label: 'Negativa Forte' },
  recontato_apos_negativa: { icon: RefreshCw,       color: 'text-indigo-500', bg: 'bg-indigo-50',  border: 'border-indigo-200', label: 'Recontato' },
  mudanca_stakeholder:     { icon: UserMinus,       color: 'text-purple-500', bg: 'bg-purple-50',  border: 'border-purple-200', label: 'Stakeholder' },
  primeiro_contato:        { icon: UserPlus,        color: 'text-blue-500',   bg: 'bg-blue-50',    border: 'border-blue-200',   label: '1º Contato' },
  marco_positivo:          { icon: Zap,             color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200',label: 'Avanço' },
};

const impactoStyles = {
  positivo: 'bg-emerald-500',
  neutro:   'bg-slate-300',
  negativo: 'bg-red-500',
};

const DecisiveMilestones = ({ analysis }) => {
  const marcos = analysis?.cronologiaInteligente || [];

  if (marcos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center fade-in">
        <Clock size={48} className="text-slate-200 mb-4" />
        <p className="text-lg font-bold text-slate-400">Cronologia Inteligente</p>
        <p className="text-sm text-slate-400 mt-1">Execute uma nova análise para gerar a cronologia com marcos decisivos.</p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="mb-6">
        <SectionTitle
          title="Cronologia Inteligente"
          subtitle={`${marcos.length} marcos decisivos identificados pela IA — momentos que mudaram o rumo do negócio.`}
        />
      </div>

      <div className="relative">
        {/* Linha vertical da timeline */}
        <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-200 via-slate-200 to-transparent"></div>

        <div className="space-y-1">
          {marcos.map((marco, i) => {
            const config = tipoConfig[marco.tipo] || tipoConfig.marco_positivo;
            const Icon = config.icon;
            const dotColor = impactoStyles[marco.impacto] || impactoStyles.neutro;

            return (
              <div key={i} className="relative pl-12 pb-5 group" style={{ animationDelay: `${i * 60}ms` }}>
                {/* Dot na timeline */}
                <div className={`absolute left-3 top-1.5 w-3.5 h-3.5 rounded-full ${dotColor} ring-4 ring-white z-10 group-hover:scale-125 transition-transform`}></div>

                {/* Card do marco */}
                <div className={`${config.bg} ${config.border} border rounded-xl p-4 hover:shadow-md transition-all duration-200`}>
                  <div className="flex items-start gap-3">
                    <Icon size={16} className={`${config.color} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${config.bg} ${config.color} border ${config.border}`}>
                          {config.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{marco.data}</span>
                        {marco.pessoa && (
                          <span className="text-[10px] font-bold text-slate-500">• {marco.pessoa}</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-800 leading-snug">{marco.titulo}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{marco.descricao}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const TimelineTab = ({ analysis }) => {
  const [view, setView] = useState('milestones');

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto">
      <div className="card p-6">
        <SectionTitle title="Histórico Comercial" subtitle="Consulte o passado da conta sem misturar fatos do CRM e interpretação da IA." />
        <div className="mt-5 inline-flex rounded-lg bg-slate-100 p-1">
          <button onClick={() => setView('milestones')} className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${view === 'milestones' ? 'bg-white text-branddi-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Marcos decisivos</button>
          <button onClick={() => setView('records')} className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${view === 'records' ? 'bg-white text-branddi-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Registros do CRM</button>
        </div>
      </div>
      {view === 'milestones' ? <DecisiveMilestones analysis={analysis} /> : <CommercialHistoryRecords analysis={analysis} />}
    </div>
  );
};

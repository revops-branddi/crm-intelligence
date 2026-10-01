import React from 'react';
import {
  Zap, AlertCircle, MessageSquare, TrendingUp, Activity,
  Mail, Users, Target, Copy, Flame, Timer, Package
} from 'lucide-react';
import { SectionTitle } from '../ui/SectionTitle';

export const DashboardTab = ({ analysis, hardMetrics, onCopyText }) => (
  <div className="space-y-6 fade-in">

    {/* ═══ ROW 1: KPIs Principais ═══ */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="card p-5 flex flex-col gap-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Health Score</p>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-black ${analysis.score > 70 ? 'text-emerald-600' : analysis.score > 40 ? 'text-orange-600' : 'text-red-600'}`}>{analysis.score}</span>
          <span className="text-slate-300 font-bold text-sm">/100</span>
        </div>
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-auto">
          <div className={`h-full transition-all duration-1000 ${analysis.score > 70 ? 'bg-emerald-500' : analysis.score > 40 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${analysis.score}%` }}></div>
        </div>
      </div>

      <div className="card p-5 flex flex-col gap-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sentimento</p>
        <div className="flex items-center gap-2">
          {(analysis.sentimento || '').startsWith('Positivo') ? <Zap className="text-orange-500" size={22} fill="#f97316" /> : (analysis.sentimento || '').startsWith('Negativo') ? <AlertCircle size={22} className="text-red-500" /> : <MessageSquare size={22} className="text-slate-400" />}
          <span className={`text-xl font-black ${(analysis.sentimento || '').startsWith('Positivo') ? 'text-emerald-600' : (analysis.sentimento || '').startsWith('Negativo') ? 'text-red-600' : 'text-slate-800'}`}>{(analysis.sentimento || '').split('(')[0].split(' -')[0].split(',')[0].trim()}</span>
        </div>
      </div>

      <div className="card p-5 flex flex-col gap-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dias Aberto</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black text-slate-800">{hardMetrics?.daysOpen}</span>
          <span className="text-slate-400 text-xs font-bold">DIAS</span>
        </div>
      </div>

      <div className="card p-5 flex flex-col gap-2 bg-branddi-cyan/10 border-branddi-cyan/20">
        <p className="text-[10px] font-bold text-branddi-navy uppercase tracking-wider">Interações</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black text-branddi-navy">{hardMetrics?.totalActions}</span>
          <span className="text-branddi-navy/60 text-xs font-bold">PONTOS</span>
        </div>
      </div>
    </div>

    {/* ═══ ROW 2: Resumo Executivo (full-width) ═══ */}
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle title="Resumo Executivo" subtitle="Insight gerado pela IA para o Head de Vendas." />
        <button onClick={() => onCopyText(analysis.resumo)} className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50 transition-colors shrink-0 ml-4"><Copy size={12} /> Copiar</button>
      </div>
      <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 p-5 rounded-xl border-l-4 border-orange-500 italic text-slate-700 leading-relaxed text-sm relative">
        <MessageSquare className="absolute -top-3 -right-3 text-orange-200" size={36} />
        "{analysis.resumo}"
      </div>
    </div>

    {/* ═══ ROW 3: Próximos Passos + Gatilhos de Urgência (2 cols iguais) ═══ */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="Próximos Passos" subtitle="Ações prioritárias." />
          <button onClick={() => onCopyText(analysis.proximosPassos.map((s, i) => `${i + 1}. ${s}`).join('\n'))} className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50 transition-colors shrink-0 ml-4"><Copy size={12} /> Copiar</button>
        </div>
        <div className="space-y-3">
          {analysis.proximosPassos.map((step, i) => (
            <div key={i} className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 hover:border-orange-200 transition-colors group">
              <div className="w-6 h-6 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 group-hover:bg-orange-600 group-hover:text-white transition-colors">{i + 1}</div>
              <span className="text-slate-700 font-medium text-sm leading-snug">{step}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <SectionTitle title="Gatilhos de Urgência" subtitle="Alertas contextuais ativos." />
        {analysis.gatilhosUrgencia?.length > 0 ? (
          <div className="space-y-3 mt-4">
            {analysis.gatilhosUrgencia.map((g, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                <Flame size={16} className={`mt-0.5 shrink-0 ${g.nivel === 'Crítico' ? 'text-red-500' : g.nivel === 'Alto' ? 'text-orange-500' : 'text-yellow-500'}`} />
                <div>
                  <span className={`text-[10px] font-black uppercase ${g.nivel === 'Crítico' ? 'text-red-600' : g.nivel === 'Alto' ? 'text-orange-600' : 'text-yellow-600'}`}>[{g.nivel}] </span>
                  <span className="text-xs font-bold text-slate-700">{g.gatilho}</span>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{g.contexto}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 p-4 bg-emerald-50 rounded-xl text-center">
            <p className="text-xs font-bold text-emerald-600">Nenhum gatilho de urgência ativo.</p>
          </div>
        )}
      </div>
    </div>

    {/* ═══ ROW 4: KPIs Secundários (Produto, SLA, Reuniões) ═══ */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {analysis.produtoRecomendado && (
        <div className="card p-4 border-l-4 border-branddi-cyan">
          <div className="flex items-center gap-2 mb-2">
            <Package size={14} className="text-branddi-cyan" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Produto</p>
          </div>
          <p className="text-sm font-black text-branddi-navy leading-tight">{analysis.produtoRecomendado.produto}</p>
          <p className="text-[10px] text-slate-500 mt-1 leading-snug line-clamp-2">{analysis.produtoRecomendado.justificativa}</p>
        </div>
      )}

      {analysis.avaliacaoSLA && (
        <div className={`card p-4 border-l-4 ${analysis.avaliacaoSLA.statusSLA === 'Em dia' ? 'border-emerald-500' : analysis.avaliacaoSLA.statusSLA === 'Atrasado' ? 'border-orange-500' : 'border-red-500'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Timer size={14} className={analysis.avaliacaoSLA.statusSLA === 'Em dia' ? 'text-emerald-600' : analysis.avaliacaoSLA.statusSLA === 'Atrasado' ? 'text-orange-600' : 'text-red-600'} />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SLA</p>
          </div>
          <p className={`text-sm font-black ${analysis.avaliacaoSLA.statusSLA === 'Em dia' ? 'text-emerald-600' : analysis.avaliacaoSLA.statusSLA === 'Atrasado' ? 'text-orange-600' : 'text-red-600'}`}>{analysis.avaliacaoSLA.statusSLA}</p>
          <p className="text-[10px] text-slate-500 mt-1">{analysis.avaliacaoSLA.diasDesdeUltimoContato}d sem contato</p>
        </div>
      )}

      <div className={`card p-4 ${(!hardMetrics?.meetingsOutbound && !hardMetrics?.meetingsSales) ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 mb-2">
          <Mail size={14} className="text-slate-400" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prospecção</p>
        </div>
        <p className="text-xl font-black text-slate-800">{hardMetrics?.meetingsOutbound || 0}</p>
        <p className="text-[10px] text-slate-400">reuniões outbound</p>
      </div>

      <div className={`card p-4 ${(!hardMetrics?.meetingsOutbound && !hardMetrics?.meetingsSales) ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 mb-2">
          <Users size={14} className="text-orange-500" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendas</p>
        </div>
        <p className="text-xl font-black text-orange-600">{hardMetrics?.meetingsSales || 0}</p>
        <p className="text-[10px] text-slate-400">reuniões closer</p>
      </div>
    </div>

    {/* ═══ ROW 5: Prioridade+Blocklist | Dores+Objeções (2 cols iguais) ═══ */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="card p-6 border-l-4 border-emerald-500">
          <SectionTitle title="Prioridade de Contato" subtitle="Quem o vendedor deve focar." />
          <div className="space-y-2 mt-4">
            {analysis.prospeccao?.listaPrioridadeContato?.length > 0 ? analysis.prospeccao.listaPrioridadeContato.map((item, i) => (
              <div key={i} className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 flex items-start gap-3">
                <div className="bg-emerald-500 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">{i + 1}</div>
                <div>
                  <p className="font-bold text-xs text-emerald-900">{item.nome}</p>
                  <p className="text-[10px] text-emerald-700 mt-0.5 leading-snug">{item.contexto}</p>
                </div>
              </div>
            )) : <p className="text-xs text-slate-500 p-2">Nenhum contato prioritário.</p>}
          </div>
        </div>

        <div className="card p-6 border-l-4 border-slate-400">
          <SectionTitle title="Blocklist" subtitle="Contatos a evitar." />
          <div className="space-y-2 mt-4">
            {analysis.prospeccao?.contatosEvitar?.length > 0 ? analysis.prospeccao.contatosEvitar.map((item, i) => (
              <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <p className="font-bold text-xs text-slate-700">{item.nome}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{item.motivo || 'Motivo não informado'}</p>
              </div>
            )) : <p className="text-xs font-bold text-emerald-600 p-2">Nenhum bloqueador no radar.</p>}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <SectionTitle title="Dores & Objeções" subtitle="O que tira o sono do cliente e as barreiras ativas." />
        <div className="flex flex-wrap gap-2 mt-4">
          {analysis.dores.map((dor, i) => (
            <span key={i} className="bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase hover:border-orange-300 transition-colors cursor-default">{dor}</span>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-slate-100">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-3">Objeções Levantadas</p>
          <div className="space-y-2">
            {analysis.objecoes.map((obj, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0"></div>
                <span className="text-xs text-slate-600 font-medium leading-snug">{obj}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

import React from 'react';
import { Building2, CheckCircle2, CircleAlert, Copy } from 'lucide-react';
import { SectionTitle } from '../ui/SectionTitle';

const empty = 'Não informado no CRM';

function Field({ label, value }) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      {values.length ? (
        <div className="mt-2 space-y-1 text-sm font-medium text-slate-700">
          {values.map((item, index) => <p key={index}>{item}</p>)}
        </div>
      ) : <p className="mt-2 text-sm text-slate-400">{empty}</p>}
    </div>
  );
}

export const CompanyTab = ({ analysis, onCopyText }) => {
  const company = analysis?.perfilEmpresa;
  if (!company) {
    return (
      <div className="card p-8">
        <SectionTitle title="Empresa / Marca" subtitle="Dados factuais consultados no CRM." />
        <p className="mt-4 text-sm text-slate-500">Esta análise é anterior ao dossiê de empresa. Atualize o deal para gerar a visão V1.</p>
      </div>
    );
  }

  const briefing = [
    'EMPRESA / MARCA',
    `Resumo: ${company.resumo || empty}`,
    `O que faz: ${company.oQueFaz || empty}`,
    `Modelo de negócio: ${company.modeloNegocio || empty}`,
    `Produtos e serviços: ${(company.produtosServicos || []).join('; ') || empty}`,
    `Canais de venda: ${(company.canaisVenda || []).join('; ') || empty}`,
    `Abrangência: ${company.abrangencia || empty}`,
    `Grupo empresarial: ${company.grupoEmpresarial || empty}`,
    `Outras marcas: ${(company.outrasMarcas || []).join('; ') || empty}`,
  ].join('\n');

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-branddi-cyan/10 text-branddi-cyan"><Building2 size={20} /></div>
            <SectionTitle title="Empresa / Marca" subtitle="Leitura factual para preparar abordagem e reunião." />
          </div>
          <button onClick={() => onCopyText(briefing)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-50"><Copy size={12} /> Copiar</button>
        </div>
        <p className="mt-5 rounded-xl border-l-4 border-branddi-cyan bg-cyan-50/40 p-4 text-sm leading-relaxed text-slate-700">{company.resumo || empty}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="O que a empresa faz" value={company.oQueFaz} />
        <Field label="Modelo de negócio" value={company.modeloNegocio} />
        <Field label="Produtos e serviços" value={company.produtosServicos} />
        <Field label="Canais de venda" value={company.canaisVenda} />
        <Field label="Abrangência" value={company.abrangencia} />
        <Field label="Grupo empresarial" value={company.grupoEmpresarial} />
        <Field label="Outras marcas do grupo" value={company.outrasMarcas} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-600" /><SectionTitle title="Evidências" subtitle="Afirmações rastreáveis no CRM ou no histórico." /></div>
          <div className="mt-4 space-y-3">
            {(company.evidencias || []).length ? company.evidencias.map((evidence, index) => (
              <div key={index} className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                <p className="text-sm font-medium text-slate-700">{evidence.afirmacao}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Fonte: {evidence.fonte}</p>
              </div>
            )) : <p className="text-sm text-slate-400">Nenhuma evidência suficiente no CRM.</p>}
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-2"><CircleAlert size={18} className="text-amber-600" /><SectionTitle title="Lacunas para a conversa" subtitle="O que não foi encontrado e vale validar com o lead." /></div>
          <ul className="mt-4 space-y-2">
            {(company.lacunas || []).length ? company.lacunas.map((item, index) => <li key={index} className="flex gap-2 text-sm text-slate-600"><span className="text-amber-500">•</span>{item}</li>) : <li className="text-sm text-slate-400">Nenhuma lacuna apontada.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};

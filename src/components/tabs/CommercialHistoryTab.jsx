import React from 'react';
import { CalendarDays, Handshake, MessagesSquare, UsersRound, CircleAlert, Database } from 'lucide-react';
import { SectionTitle } from '../ui/SectionTitle';

const formatDate = (value) => {
  if (!value) return 'Data não informada';
  const [date] = value.split(' ');
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
};

const Source = ({ value }) => <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Fonte: {value}</p>;

const Empty = ({ children }) => <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{children}</p>;

const EventList = ({ events, emptyMessage, showParticipants = false }) => events?.length ? (
  <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
    {events.map((event, index) => (
      <article key={`${event.source}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-slate-700">{formatDate(event.date)}</span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{event.kind}</span>
          {event.status && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${event.status === 'Concluída' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{event.status}</span>}
          {event.responsible && <span className="text-[10px] text-slate-500">Responsável: {event.responsible}</span>}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{event.summary}</p>
        {showParticipants && event.participants?.length > 0 && <p className="mt-2 text-xs text-slate-600"><strong>Participantes registrados:</strong> {event.participants.join(', ')}</p>}
        <Source value={event.source} />
      </article>
    ))}
  </div>
) : <Empty>{emptyMessage}</Empty>;

export const CommercialHistoryRecords = ({ analysis }) => {
  const history = analysis?.historicoComercial;

  if (!history) {
    return <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Esta análise é anterior aos registros estruturados. Clique em “Atualizar Análise” para buscá-los no Pipedrive.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <div className="flex items-center gap-2"><Database size={16} className="text-branddi-cyan" /><span><strong>{history.coverage?.totalFlowItems || 0}</strong> registros do Pipedrive consolidados sem interpretação da IA.</span></div>
        {history.coverage?.historyTruncated && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">{history.coverage.note}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="mb-4 flex items-center gap-2"><CalendarDays size={18} className="text-branddi-cyan" /><SectionTitle title="Reuniões anteriores" subtitle="Data, tema, status e participantes registrados." /></div>
          <EventList events={history.meetings} emptyMessage="Nenhuma reunião foi encontrada nos registros carregados." showParticipants />
        </section>
        <section className="card p-6">
          <div className="mb-4 flex items-center gap-2"><UsersRound size={18} className="text-indigo-600" /><SectionTitle title="Participantes vinculados" subtitle="Pessoas associadas ao deal no Pipedrive." /></div>
          {history.participants?.length ? <div className="space-y-3">{history.participants.map((person, index) => <article key={`${person.source}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-bold text-slate-700">{person.name}</p>{person.role && <p className="mt-1 text-xs text-slate-500">{person.role}</p>}{person.email && <p className="mt-1 text-xs text-slate-500">{person.email}</p>}<Source value={person.source} /></article>)}</div> : <Empty>Nenhum participante vinculado foi retornado pelo Pipedrive.</Empty>}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="mb-4 flex items-center gap-2"><Handshake size={18} className="text-emerald-600" /><SectionTitle title="Registros de negociação" subtitle="Eventos com termos explícitos de proposta, valor, contrato ou escopo." /></div>
          <EventList events={history.negotiations} emptyMessage="Nenhum registro explícito de negociação foi encontrado. Isso não confirma que não houve negociação; ela pode não ter sido registrada." />
        </section>
        <section className="card p-6">
          <div className="mb-4 flex items-center gap-2"><CircleAlert size={18} className="text-red-500" /><SectionTitle title="Motivos documentados de não avanço" subtitle="Somente motivos explícitos no deal ou no histórico." /></div>
          {history.nonAdvanceReasons?.length ? <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">{history.nonAdvanceReasons.map((reason, index) => <article key={`${reason.source}-${index}`} className="rounded-xl border border-red-100 bg-red-50/40 p-4"><p className="text-sm leading-relaxed text-slate-700">{reason.reason}</p><p className="mt-2 text-xs font-semibold text-slate-600">{formatDate(reason.date)}</p><Source value={reason.source} /></article>)}</div> : <Empty>Nenhum motivo explícito foi encontrado. A ausência de registro não confirma que não existiu um motivo.</Empty>}
        </section>
      </div>

      <section className="card p-6">
        <div className="mb-4 flex items-center gap-2"><MessagesSquare size={18} className="text-orange-500" /><SectionTitle title="Interações e tratativas operacionais" subtitle="Notas, e-mails, atividades e atualizações retornadas pelo histórico do deal." /></div>
        <EventList events={history.interactions} emptyMessage="Nenhuma interação foi retornada pelo Pipedrive." />
      </section>
    </div>
  );
};

import { Copy, FileSearch } from 'lucide-react';
const labels = { fact: 'Fato registrado', inference: 'Inferência', recommendation: 'Recomendação' };
export function AnswerPanel({ record, onSource, onCopy }) {
  if (!record)
    return (
      <div className="card empty-state">
        <FileSearch size={30} />
        <h3>Os dados e a análise têm seu próprio espaço.</h3>
        <p>
          Consulte o texto preservado em Dados e fontes. A análise automática aparece aqui quando
          estiver pronta; para uma versão antiga sem análise, use uma das ações abaixo.
        </p>
      </div>
    );
  const answer = record.answer;
  const copy = () =>
    onCopy(
      answer.sections
        .map(
          (section) =>
            `${section.title}\n${section.claims.map((claim) => `${labels[claim.kind]}: ${claim.text}\n${claim.citations.map((ref) => `Fonte ${ref.sourceId}: “${ref.quote}”`).join('\n')}`).join('\n\n')}`,
        )
        .join('\n\n') + `\n\nLacunas:\n${answer.gaps.join('\n')}`,
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3 text-xs text-slate-500">
        <span>
          {new Date(record.created_at).toLocaleString('pt-BR')} · {record.model} ·{' '}
          {record.context_manifest.selectedChunks}/{record.context_manifest.totalChunks} trechos
          consultados
        </span>
        <button className="flex gap-2 font-bold text-branddi-navy" onClick={copy}>
          <Copy size={14} />
          Copiar com fontes
        </button>
      </div>
      {record.question && <p className="card p-4 font-semibold">{record.question}</p>}
      {answer.sections.map((section, index) => (
        <section className="card p-6" key={index}>
          <h2 className="text-lg font-bold text-branddi-navy mb-4">{section.title}</h2>
          <div className="space-y-5">
            {section.claims.map((claim, i) => (
              <article className="answer-claim" key={i}>
                <span
                  className={`text-xs font-bold ${claim.kind === 'fact' ? 'text-emerald-700' : claim.kind === 'inference' ? 'text-amber-700' : 'text-indigo-700'}`}
                >
                  {labels[claim.kind]}
                </span>
                <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{claim.text}</p>
                <div className="mt-2 space-y-2">
                  {claim.citations.map((ref, j) => (
                    <button
                      onClick={() => onSource(ref.sourceId)}
                      key={j}
                      className="block w-full text-left text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 hover:border-branddi-cyan"
                    >
                      <span className="flex gap-2 text-branddi-navy font-semibold">
                        <FileSearch size={14} />
                        Abrir fonte
                      </span>
                      <q className="block text-slate-600 mt-1 whitespace-pre-wrap">{ref.quote}</q>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {!!answer.gaps.length && (
        <section className="rounded-xl bg-amber-50 border border-amber-200 p-5">
          <h2 className="font-bold text-amber-900">Lacunas e limites da resposta</h2>
          <ul className="mt-2 list-disc pl-5 space-y-2 text-sm text-amber-900">
            {answer.gaps.map((gap, i) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </section>
      )}
      {!!answer.suggestedQuestions.length && (
        <section className="card p-5">
          <h2 className="font-bold">Perguntas para esclarecer</h2>
          <ul className="list-disc pl-5 mt-2 space-y-2 text-sm">
            {answer.suggestedQuestions.map((question, i) => (
              <li key={i}>{question}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

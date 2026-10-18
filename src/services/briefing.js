export const briefingBoards = [
  {
    id: 'company',
    title: 'Empresa e grupo',
    subtitle: 'Estrutura, marcas e escopo',
    questions: [
      'A marca pertence a um grupo? Quais marcas e BUs fazem parte dele?',
      'Qual marca está sendo abordada, o domínio, o segmento e a abrangência?',
      'Existe aplicativo relevante? Como funciona a notificação?',
    ],
  },
  {
    id: 'people',
    title: 'Pessoas e papéis',
    subtitle: 'Contato, influência e responsáveis',
    questions: [
      'Quem é o contato principal, seu cargo, canal e escopo sobre as marcas?',
      'Quem decide, quem participa e quem representa a Branddi?',
      'Há cards relacionados ou responsáveis com quem alinhar a abordagem?',
    ],
  },
  {
    id: 'history',
    title: 'Histórico comercial',
    subtitle: 'Interações, compromissos e objeções',
    questions: [
      'Qual foi a última interação real e o motivo do aceite?',
      'Já houve reunião? Quando, com quem e por que não avançou?',
      'Quais objeções, recusas e compromissos precisam ser respeitados?',
    ],
  },
  {
    id: 'opportunity',
    title: 'Diagnóstico e oportunidade',
    subtitle: 'Produto, evidências e aderência',
    questions: [
      'Quais marcas, domínios, termos e regiões foram monitorados?',
      'Os anunciantes são concorrentes, parceiros, afiliados ou empresas do grupo?',
      'Qual produto tem aderência? O diagnóstico é atual e diferencia estimativa de impacto declarado?',
    ],
  },
  {
    id: 'approach',
    title: 'Abordagem e próximos passos',
    subtitle: 'Gancho, mensagem e ação recomendada',
    questions: [
      'Qual produto priorizar e qual gancho usar para este contato?',
      'Qual abordagem respeita o histórico e as objeções?',
      'Qual é a próxima ação, com responsável e prazo registrados?',
    ],
  },
  {
    id: 'meeting',
    title: 'Reunião e materiais',
    subtitle: 'Agenda, relatório e preparação',
    questions: [
      'Data, fuso, atividade e convite estão coerentes? Há confirmação de presença?',
      'Relatório e apresentação pertencem à marca correta e estão atualizados?',
      'O material foi gerado, revisado e enviado? Quais perguntas faltam esclarecer?',
    ],
  },
];
const clean = (text = '') =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const rules = [
  [
    'people',
    /participante|papeis|pessoas|contato principal|responsavel atual|proprietari|cargo|autoridade/,
  ],
  ['history', /cronologia|historico|ultima interacao|objec|recusa|compromissos anteriores/],
  ['approach', /prospeccao|abordagem|mensage|proximos passos|acoes recomendadas/],
  ['meeting', /reuniao|agenda|convite|apresenta|material|preparacao|compromisso/],
  [
    'opportunity',
    /diagnostico|oportunidade|produto|aderencia|dores|monitor|anunciant|economia|receita|perda/,
  ],
  ['company', /empresa|grupo|marca|dominio|segmento/],
];
export function claimCategory(claim, title = '') {
  if (briefingBoards.some((board) => board.id === claim.category)) return claim.category;
  // Historical answers have no category. Group them for display without changing
  // their wording, certainty, sources or chronological order within a board.
  const text = clean(claim.text);
  if (/cargo|autoridade|contato principal|responsavel atual|proprietari|owner_id/.test(text))
    return 'people';
  if (/recusa|recusou|objec|ultima interacao|call anterior/.test(text)) return 'history';
  if (claim.kind === 'recommendation' && !/convite|apresentacao|reuniao|agenda/.test(text))
    return 'approach';
  if (/anunciant|monitoria|pescaria|diagnostico|economia|estimativa|produto.{0,20}elegi/.test(text))
    return 'opportunity';
  if (
    /cnpj|razao social|varejista|varejo|pertence|pertencente|grupo economico|segmento|operacao fisica/.test(
      text,
    )
  )
    return 'company';
  const section = clean(title);
  const sectionMatch = rules.find(([, rule]) => rule.test(section));
  if (sectionMatch) return sectionMatch[0];
  return rules.find(([, rule]) => rule.test(clean(claim.text)))?.[0] || 'history';
}
export function organizeBriefing(record, company) {
  const boards = briefingBoards.map((board) => ({ ...board, claims: [] }));
  for (const [sectionIndex, section] of (record?.answer?.sections || []).entries())
    for (const [claimIndex, claim] of section.claims.entries()) {
      const item = { ...claim, key: `${sectionIndex}:${claimIndex}`, section: section.title };
      boards.find((board) => board.id === claimCategory(claim, section.title)).claims.push(item);
    }
  // Raw organization fields remain visible even when the saved AI answer omits
  // company context. AI conclusions are retained after the attributed records.
  boards[0].claims.unshift(...(company?.facts || []));
  return boards;
}
export function reviewItems(record) {
  const claims = organizeBriefing(record).flatMap((board) => board.claims);
  return claims
    .filter((claim) => {
      const text = clean(claim.text);
      return (
        /diverg|inconsisten|conflit|incorret/.test(text) &&
        !/sem (?:evidencia de )?(?:divergenc|inconsisten|conflit)|nao (?:ha|existe) (?:divergenc|inconsisten|conflit)/.test(
          text,
        )
      );
    })
    .map((claim) => ({
      id: `${record.id}:${claim.key}`,
      title: claim.section.replace(/^\d+[.)]\s*/, ''),
      found: claim.text,
      citations: claim.citations,
      expected: 'Registros coerentes entre si, com a fonte e a data de referência identificadas.',
      impact:
        'Conferir se a divergência afeta a abordagem, o diagnóstico ou a preparação da reunião.',
    }));
}
export function draftForReview(item, snapshot) {
  return {
    title: `[CRM #${snapshot.deal_id}] Verificar ${item.title.toLocaleLowerCase('pt-BR')}`,
    description: `Negócio: ${snapshot.title} (#${snapshot.deal_id})\nExtração: ${snapshot.started_at}\n\nOcorrência a validar:\n${item.found}\n\nEsperado:\n${item.expected}\n\nImpacto a avaliar:\n${item.impact}\n\nEvidências:\n${item.citations.map((ref) => `${ref.sourceId}: “${ref.quote}”`).join('\n')}\n\nSolicitação: conferir os registros de origem, confirmar a causa e corrigir se necessário.`,
  };
}
export const claimLabels = {
  fact: 'Fato registrado',
  inference: 'Inferência',
  recommendation: 'Recomendação',
};
export const HUB_HELPDESK = 'https://revops.branddi.com/operacao/central-revops/helpdesk';
export function helpdeskDraftUrl(draft) {
  const text = `${draft.title.trim()}\n\n${draft.description.trim()}`;
  // Same 4,000-character limit and canonical opening flow as the Hub form.
  // This opens a draft; only the Hub's authenticated confirmation creates a ticket.
  if (text.length < 15 || text.length > 4000) return null;
  const url = new URL(`${HUB_HELPDESK}/novo`);
  url.searchParams.set('natureza', 'erro');
  url.searchParams.set('texto', text);
  return url.href;
}
export function answerText(record, company) {
  const profile = company?.facts?.length
    ? `Empresa e grupo · organização #${company.organizationId || 'não vinculada'}\n${company.facts.map((fact) => `${fact.attribution}: ${fact.text}\n${fact.citations.map((ref) => `Fonte ${ref.sourceId}: “${ref.quote}”`).join('\n')}`).join('\n\n')}\n${company.warnings.join('\n')}\n\n`
    : '';
  if (!record) return profile;
  return (
    profile +
    (record.answer.sections
      .map(
        (section) =>
          `${section.title}\n${section.claims.map((claim) => `${claimLabels[claim.kind]}: ${claim.text}\n${claim.citations.map((ref) => `Fonte ${ref.sourceId}: “${ref.quote}”`).join('\n')}`).join('\n\n')}`,
      )
      .join('\n\n') +
      `\n\nLacunas:\n${record.answer.gaps.join('\n')}`)
  );
}

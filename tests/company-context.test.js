import test from 'node:test';
import assert from 'node:assert/strict';
import { companyContext } from '../server/company-context.js';
import { organizeBriefing, answerText } from '../src/services/briefing.js';

const deal = {
  id: 'deal:1',
  kind: 'deal',
  recordId: '7',
  text: 'Título: Lume | Produto A\nOrganização: 250',
};
const organization = {
  id: 'organization:250',
  kind: 'organization',
  recordId: '250',
  text: 'Nome: Lume\nSite: lume.example.test\nSetor.0: Varejo\ncustom_fields.CNPJ: 00000000000000\ncustom_fields.Grupo Empresarial: não informado',
};
const note = {
  id: 'note:1',
  kind: 'notes',
  recordId: '1',
  date: '2026-10-16T12:00:00Z',
  text: 'Organização: 250\ndeal_id: 7\n * Faz parte de grupo: Pertence ao Grupo Arco.\nLDR - Marca(s) encontradas: Grupo Arco: Lume e Nuvem\nSDR - Alcance da Marca: Nacional',
};

test('company and group come from preserved fields even when AI omitted the board', () => {
  const sources = [deal, organization, note];
  const company = companyContext(sources);
  assert.equal(company.organizationId, '250');
  assert.equal(company.facts[0].field, 'group');
  assert.match(company.facts[0].text, /Grupo Arco/);
  assert.equal(company.facts[0].origin, 'note');
  assert.match(company.facts[1].text, /Lume.*lume.example.test.*Varejo.*00000000000000/);
  assert.equal(company.facts[1].origin, 'organization');
  for (const fact of company.facts)
    for (const ref of fact.citations)
      assert.ok(sources.find((source) => source.id === ref.sourceId).text.includes(ref.quote));
  assert.match(company.warnings.join(' '), /não está preenchido no cadastro/);
  const record = { answer: { sections: [], gaps: [], suggestedQuestions: [] } };
  assert.equal(
    organizeBriefing(record, company).find((board) => board.id === 'company').claims.length,
    company.facts.length,
  );
  assert.match(answerText(record, company), /Grupo Arco[\s\S]*Fonte note:1/);
  assert.deepEqual(record.answer.sections, []);
});

test('different product cards share organization identity without borrowing deal notes', () => {
  const first = companyContext([deal, organization, note]);
  const second = companyContext([
    { ...deal, recordId: '8', text: 'Título: Lume | Produto B\nOrganização: 250' },
    organization,
    note,
  ]);
  assert.deepEqual(
    first.facts.find((fact) => fact.field === 'identity'),
    second.facts.find((fact) => fact.field === 'identity'),
  );
  assert.equal(
    second.facts.some((fact) => fact.field === 'group'),
    false,
  );
  const unrelated = companyContext([
    { ...deal, text: 'Título: Lume | Produto A\nOrganização: 251' },
    organization,
    note,
  ]);
  assert.equal(unrelated.facts.length, 0);
  assert.match(unrelated.warnings.join(' '), /#251/);
});

test('keeps conflicting group evidence attributed and rejects implicit group guesses', () => {
  const company = companyContext([
    deal,
    { ...organization, text: organization.text.replace('não informado', 'Grupo Origem') },
    note,
    {
      ...note,
      id: 'note:2',
      text: 'Site: Grupo Inventado\nConcorrentes: Outra marca\nCargo: Diretor Grupo Imaginado',
    },
    {
      ...note,
      id: 'activity:1',
      kind: 'activities',
      text: 'Grupo: Não usar atividade como cadastro',
    },
  ]);
  assert.deepEqual(
    company.facts.filter((fact) => fact.field === 'group').map((fact) => fact.origin),
    ['organization', 'note'],
  );
  assert.doesNotMatch(JSON.stringify(company.facts), /Inventado|Imaginado|usar atividade/);
  assert.equal(company.facts.filter((fact) => fact.field === 'identity').length, 1);
});

test('deduplicates equal recorded values with literal citations and never equates brand names with organization IDs', () => {
  const company = companyContext([deal, organization, note, { ...note, id: 'note:2' }]);
  assert.equal(company.facts.filter((fact) => fact.field === 'group').length, 1);
  assert.equal(company.facts[0].citations.length, 2);
  const unlinked = companyContext([{ ...deal, text: 'Título: Lume | Produto A' }, organization]);
  assert.equal(unlinked.organizationId, null);
  assert.equal(unlinked.facts.length, 0);
  assert.match(unlinked.warnings[0], /não foi inferido/i);
});

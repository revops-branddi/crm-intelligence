import test from 'node:test';
import assert from 'node:assert/strict';
import {
  organizeBriefing,
  reviewItems,
  draftForReview,
  helpdeskDraftUrl,
} from '../src/services/briefing.js';
import { dealMaterials } from '../server/materials.js';
const citation = { sourceId: 'notes:1:0', quote: 'O cargo diverge entre o cadastro e o e-mail.' };
const claim = { text: citation.quote, kind: 'fact', citations: [citation] };
const record = {
  id: 'answer1',
  answer: { sections: [{ title: 'Pessoas', claims: [claim] }], gaps: [], suggestedQuestions: [] },
};
test('six stable boards retain every historical claim, its type and complete evidence', () => {
  const input = structuredClone(record);
  input.answer.sections.push({
    title: 'Título antigo sem categoria',
    claims: [{ ...claim, text: 'O cliente pediu uma demonstração.' }],
  });
  const before = structuredClone(input);
  const boards = organizeBriefing(input);
  assert.deepEqual(
    boards.map((board) => board.id),
    ['company', 'people', 'history', 'opportunity', 'approach', 'meeting'],
  );
  assert.equal(boards.flatMap((board) => board.claims).length, 2);
  assert.deepEqual(
    boards.find((board) => board.id === 'people').claims[0].citations,
    claim.citations,
  );
  assert.deepEqual(input, before);
  input.answer.sections[0].claims[0].category = 'meeting';
  assert.equal(organizeBriefing(input).find((board) => board.id === 'meeting').claims.length, 1);
});
test('review drafts are individual and never report the Hub ticket as created', () => {
  const input = structuredClone(record);
  input.answer.sections[0].claims.push({ ...claim, text: 'Não há divergência entre os cargos.' });
  const items = reviewItems(input);
  assert.equal(items.length, 1);
  const draft = draftForReview(items[0], {
    title: 'Cliente teste',
    deal_id: '7',
    started_at: '2026-10-18',
  });
  const url = new URL(helpdeskDraftUrl(draft));
  assert.equal(url.origin, 'https://revops.branddi.com');
  assert.equal(url.pathname, '/operacao/central-revops/helpdesk/novo');
  assert.equal(url.searchParams.get('natureza'), 'erro');
  assert.match(url.searchParams.get('texto'), /notes:1:0/);
  assert.match(url.searchParams.get('texto'), /Ocorrência a validar/);
  assert.equal(helpdeskDraftUrl({ title: 'x', description: 'a'.repeat(4000) }), null);
  assert.equal(helpdeskDraftUrl({ title: '', description: '' }), null);
});
test('historical combined headings keep company facts separate from product diagnosis', () => {
  const input = structuredClone(record);
  input.answer.sections = [
    {
      title: 'Empresa e aderência aos produtos Branddi',
      claims: [
        { ...claim, text: 'A empresa é uma varejista do grupo, com CNPJ no cadastro.' },
        { ...claim, text: 'A monitoria identificou anunciantes e uma estimativa de economia.' },
      ],
    },
  ];
  const boards = organizeBriefing(input);
  assert.equal(boards.find((board) => board.id === 'company').claims.length, 1);
  assert.equal(boards.find((board) => board.id === 'opportunity').claims.length, 1);
});
test('materials list only recorded deal links, deduplicates and rejects embedded credentials', () => {
  const sources = [
    {
      kind: 'deal',
      id: 'deal:1:0',
      date: '2026-10-18',
      text: 'custom_fields.Relatório BB: https://report.example.test/client\ncustom_fields.Link PPT: https://docs.google.com/presentation/d/test\ncustom_fields.Link PPT: https://docs.google.com/presentation/d/test\ncustom_fields.Relatório: https://user:password@example.test/report\ncustom_fields.Relatório: javascript:alert(1)',
    },
    { kind: 'notes', id: 'notes:1:0', text: 'Relatório antigo: https://old.example.test/report' },
  ];
  const result = dealMaterials(sources);
  assert.equal(result.materials.length, 2);
  assert.equal(result.materials[0].title, 'Relatório BB');
  assert.equal(result.materials[0].sourceId, 'deal:1:0');
  assert.equal(result.materials[0].quote, sources[0].text.split('\n')[0]);
  assert.ok(result.materials.every((material) => !('verified' in material)));
});

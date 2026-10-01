import test from 'node:test';
import assert from 'node:assert/strict';
import { companyProfileToPrompt, normalizeCompanyAnalysis, normalizeCompanyProfile } from './company-profile.js';

test('preserva campos padrão e traduz opções de campos customizados', () => {
  const profile = normalizeCompanyProfile(
    {
      name: 'Marca Exemplo',
      website: 'https://exemplo.com.br',
      aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: '174',
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: '745,749',
      cccccccccccccccccccccccccccccccccccccccc: '',
    },
    [
      { key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Vertical', options: [{ id: 174, label: 'Varejo' }] },
      { key: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Serviços de interesse', options: [{ id: 745, label: 'Brand Bidding' }, { id: 749, label: 'Buy Box Protection' }] },
      { key: 'cccccccccccccccccccccccccccccccccccccccc', name: 'Ignorar', options: [] },
      { key: 'website', name: 'Site', options: [] },
    ],
  );

  assert.equal(profile.fields.site, 'https://exemplo.com.br');
  assert.deepEqual(profile.customFields, [
    { label: 'Vertical', value: 'Varejo' },
    { label: 'Serviços de interesse', value: 'Brand Bidding, Buy Box Protection' },
  ]);
  assert.match(companyProfileToPrompt(profile), /Vertical: Varejo/);
});

test('declara indisponibilidade de organização sem inventar dados', () => {
  assert.match(companyProfileToPrompt({ available: false }), /Declare esta lacuna/);
});

test('converte ausência em lacuna e descarta evidência sem fonte verificável', () => {
  const analysis = normalizeCompanyAnalysis({
    resumo: 'Marca de exemplo.',
    oQueFaz: 'Vende cosméticos.',
    evidencias: [
      { afirmacao: 'Opera no varejo.', fonte: 'CRM — organização' },
      { afirmacao: 'Afirmação sem fonte confiável.', fonte: 'Internet' },
    ],
  });

  assert.deepEqual(analysis.evidencias, [{ afirmacao: 'Opera no varejo.', fonte: 'CRM — organização' }]);
  assert.ok(analysis.lacunas.includes('Qual é o modelo de negócio da empresa?'));
  assert.ok(analysis.lacunas.includes('Quais são os principais produtos e serviços?'));
});

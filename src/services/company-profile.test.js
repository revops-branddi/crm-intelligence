import test from 'node:test';
import assert from 'node:assert/strict';
import { companyProfileToPrompt, normalizeCompanyProfile } from './company-profile.js';

test('preserva campos padrão e traduz opções de campos customizados', () => {
  const profile = normalizeCompanyProfile(
    {
      name: 'Marca Exemplo',
      website: 'https://exemplo.com.br',
      custom_vertical: '174',
      custom_services: '745,749',
      custom_empty: '',
    },
    [
      { key: 'custom_vertical', name: 'Vertical', options: [{ id: 174, label: 'Varejo' }] },
      { key: 'custom_services', name: 'Serviços de interesse', options: [{ id: 745, label: 'Brand Bidding' }, { id: 749, label: 'Buy Box Protection' }] },
      { key: 'custom_empty', name: 'Ignorar', options: [] },
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

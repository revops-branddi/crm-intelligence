import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const migration = await fs.readFile(
  new URL('../supabase/migrations/202610170001_crm_intelligence.sql', import.meta.url),
  'utf8',
);
test('migration enforces private storage, denies browser access, atomic budgets and owner-bound leases', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table public.deal_analyses(id integer);grant select on public.deal_analyses to authenticated;grant usage on schema public to anon,authenticated,service_role;`,
    );
    await db.exec(migration);
    const owner = '11111111-1111-4111-8111-111111111111',
      other = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users(id) values($1),($2)', [owner, other]);
    const {
      rows: [snapshot],
    } = await db.query(
      "insert into crm_snapshots(user_id,company_id,deal_id,title) values($1,'co','7','Synthetic') returning id",
      [owner],
    );
    await db.exec('set role authenticated');
    for (const table of [
      'crm_connections',
      'crm_snapshots',
      'crm_raw_pages',
      'crm_answers',
      'crm_usage_limits',
      'deal_analyses',
    ])
      await assert.rejects(() => db.query(`select * from ${table}`), /permission denied/);
    await assert.rejects(
      () => db.query("select crm_consume_limit('other','ai',99,60)"),
      /permission denied/,
    );
    await db.exec('reset role;set role service_role');
    const limits = await Promise.all(
      Array.from({ length: 5 }, () =>
        db.query("select crm_consume_limit('owner','ai',2,60) as allowed"),
      ),
    );
    assert.equal(limits.filter((result) => result.rows[0].allowed).length, 2);
    const lease = '33333333-3333-4333-8333-333333333333';
    assert.equal(
      (
        await db.query('select crm_claim_snapshot($1,$2,$3) as allowed', [
          snapshot.id,
          other,
          lease,
        ])
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await db.query('select crm_claim_snapshot($1,$2,$3) as allowed', [
          snapshot.id,
          owner,
          lease,
        ])
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await db.query('select crm_claim_snapshot($1,$2,$3) as allowed', [
          snapshot.id,
          owner,
          lease,
        ])
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(
      () => db.query("update crm_raw_pages set payload='{}'"),
      /permission denied/,
    );
    await db.exec('reset role');
    assert.equal(
      (await db.query("select public from storage.buckets where id='crm-originals'")).rows[0]
        .public,
      false,
    );
  } finally {
    await db.close();
  }
});

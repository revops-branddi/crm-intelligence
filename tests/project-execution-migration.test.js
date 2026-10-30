import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
test('execution migration denies browser writes and serializes approvals across users', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.crm_snapshots(id uuid primary key);grant usage on schema public to anon,authenticated,service_role;',
    );
    await db.exec(
      await fs.readFile(
        new URL('../supabase/migrations/20261030150000_project_executions.sql', import.meta.url),
        'utf8',
      ),
    );
    const a = '11111111-1111-4111-8111-111111111111',
      b = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users values($1),($2)', [a, b]);
    await db.query('insert into crm_snapshots values($1)', [a]);
    await db.exec('set role authenticated');
    await assert.rejects(
      () => db.query('select * from crm_project_executions'),
      /permission denied/,
    );
    await db.exec('reset role;set role service_role');
    for (const id of [a, b])
      await db.query(
        "insert into crm_project_executions(id,user_id,snapshot_id,company_id,deal_id,org_id,system,status,parameters,command,proof,assignee,reason,expires_at) values($1,$1,$2,'co','17','9','serp','draft','{}','{}','proof','{}','reason',now())",
        [id, a],
      );
    await db.query(
      "update crm_project_executions set status='dispatching' where id=$1 and status='draft'",
      [a],
    );
    await assert.rejects(
      () =>
        db.query(
          "update crm_project_executions set status='dispatching' where id=$1 and status='draft'",
          [b],
        ),
      /unique constraint/,
    );
    const { rows } = await db.query(
      "update crm_project_executions set status='dispatching' where id=$1 and status='draft' returning id",
      [a],
    );
    assert.equal(rows.length, 0);
    await db.query("update crm_project_executions set status='completed' where id=$1", [a]);
    await db.query("update crm_project_executions set status='dispatching' where id=$1", [b]);
  } finally {
    await db.close();
  }
});

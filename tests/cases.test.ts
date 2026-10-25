import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCase } from '../lib/cases';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const input = { title: '  Estate intake  ', type: 'Probate', county: '', assignee: '', description: '  Notes  ' };
test('normalizes only supported business fields and accepts optional blanks', () => {
  assert.deepEqual(validateCase({ ...input, status: 'Complete' } as any), { title: 'Estate intake', type: 'Probate', county: '', assignee: '', description: 'Notes' });
});
test('rejects blank, oversized, and unsupported inputs', () => {
  for (const patch of [{ title: '  ' }, { title: 'x'.repeat(201) }, { type: 'Other' }, { county: 'x'.repeat(101) }, { assignee: 'x'.repeat(101) }, { description: 'x'.repeat(10001) }]) {
    assert.throws(() => validateCase({ ...input, ...patch }));
  }
});
test('migration enforces persistence, constraints, ownership, anonymous denial, and optimistic task updates', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');`);
    await db.exec(readFileSync('supabase/migrations/20261025051948_case_intake.sql', 'utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';`);
    const result = await db.query<{id:string}>(`insert into public.cases (title,type) values ('Estate intake','Probate') returning id`);
    const id = result.rows[0].id;
    assert.equal((await db.query('select * from public.cases')).rows.length, 1);
    await assert.rejects(db.exec(`insert into public.cases(title,type) values (' ','Probate')`));
    await assert.rejects(db.exec(`insert into public.cases(title,type) values ('Test','Invalid')`));
    await assert.rejects(db.exec(`update public.cases set user_id = '00000000-0000-4000-8000-000000000002'`));
    assert.equal((await db.query(`update public.cases set tasks='[{"title":"Review"}]',version=2 where id=$1 and version=1 returning id`, [id])).rows.length, 1);
    assert.equal((await db.query(`update public.cases set tasks='[]',version=2 where id=$1 and version=1 returning id`, [id])).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002'`);
    assert.equal((await db.query('select * from public.cases')).rows.length, 0);
    assert.equal((await db.query(`update public.cases set tasks='[]' where id=$1 returning id`, [id])).rows.length, 0);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.cases'));
    await assert.rejects(db.exec(`insert into public.cases(title,type) values ('No','Probate')`));
  } finally { await db.close(); }
});

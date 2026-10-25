import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCase, getCases, saveCaseTasks } from '../lib/cases';
test('Supabase transport confirms writes, preserves retry IDs, reloads rows, and rejects errors/conflicts', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
  const originalFetch = globalThis.fetch;
  let saved: any = null;
  let failWrite = true;
  let failRead = false;
  let inserts = 0;
  const input = { title: '  Test case  ', type: 'Probate', county: '', description: 'Notes', assignee: '' };
  const id = '00000000-0000-4000-8000-000000000003';
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url));
    const method = options?.method || 'GET';
    const response = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (method === 'POST') {
      inserts++;
      assert.match(String(new Headers(options?.headers).get('prefer')), /return=representation/);
      if (failWrite) return response({ message: 'Temporary failure' }, 503);
      saved = { ...JSON.parse(String(options?.body)), version: 1, status: 'Open', tasks: [], created_at: new Date().toISOString() };
      assert.equal(saved.title, 'Test case');
      assert.equal(saved.user_id, undefined);
      return response(saved);
    }
    if (method === 'PATCH') {
      assert.equal(parsed.searchParams.get('version'), 'eq.1');
      return response(null);
    }
    if (failRead) return response({ message: 'Read failed' }, 503);
    return response(parsed.searchParams.has('id') ? saved : saved ? [saved] : []);
  };
  try {
    await assert.rejects(createCase(input, id), { message: 'Temporary failure' });
    assert.equal(saved, null);
    failWrite = false;
    const created = await createCase(input, id);
    assert.equal(created.id, id);
    assert.equal(inserts, 2);
    // Simulate retry after the first successful response was lost.
    assert.equal((await createCase(input, id)).id, id);
    assert.equal(inserts, 2);
    assert.deepEqual(await getCases(), [created]);
    await assert.rejects(saveCaseTasks(created, []), /changed in another session/);
    failRead = true;
    await assert.rejects(getCases(), { message: 'Read failed' });
  } finally { globalThis.fetch = originalFetch; }
});

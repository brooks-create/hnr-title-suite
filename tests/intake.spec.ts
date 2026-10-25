import { test, expect } from '@playwright/test';
test('sign in, validate, retain failed input, retry once, reload, and handle load failure', async ({ page }) => {
  const rows: any[] = [];
  let failWrite = true;
  let failRead = false;
  let writes = 0;
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.com', aud: 'authenticated', role: 'authenticated' };
  await page.route('https://intake-test.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body: any = [];
    let status = 200;
    if (url.pathname.endsWith('/token')) body = { access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user };
    else if (url.pathname.endsWith('/user')) body = user;
    else if (url.pathname.endsWith('/cases')) {
      if (route.request().method() === 'POST') {
        writes++;
        if (failWrite) { status = 503; body = { message: 'Database temporarily unavailable' }; }
        else { const row = { ...route.request().postDataJSON(), status: 'Open', tasks: [], version: 1, created_at: new Date().toISOString() }; rows.push(row); body = row; }
      } else if (failRead) { status = 503; body = { message: 'Read failed' }; }
      else if (url.searchParams.has('id')) body = rows.find(r => 'eq.' + r.id === url.searchParams.get('id')) || null;
      else body = rows;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '📁 Cases', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('No cases yet.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ New case', exact: true }).click();
  await page.getByLabel('Title *', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Title is required' })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByLabel('Title *', { exact: true }).fill('  Estate intake  ');
  await page.getByLabel('Description', { exact: true }).fill('Research notes');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Database temporarily unavailable' })).toBeVisible();
  await expect(page.getByLabel('Title *', { exact: true })).toHaveValue('  Estate intake  ');
  failWrite = false;
  await page.getByRole('button', { name: 'Create', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText('✓ Case saved to Supabase.', { exact: true })).toBeVisible();
  expect(rows).toHaveLength(1);
  await expect(page.getByText('Research notes', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '📁 Cases', exact: true }).click();
  await expect(page.getByRole('button').filter({ hasText: 'Estate intake' })).toBeVisible();
  failRead = true;
  await page.getByRole('button', { name: 'Refresh cases', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load cases' })).toBeVisible();
  await expect(page.getByText('No cases yet.', { exact: true })).toHaveCount(0);
});

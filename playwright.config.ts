import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: { command: 'npm run dev -- --hostname 127.0.0.1', url: 'http://127.0.0.1:3000', reuseExistingServer: false,
    env: { NEXT_PUBLIC_SUPABASE_URL: 'https://intake-test.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key' } },
});

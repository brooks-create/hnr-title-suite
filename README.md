# HNR Title Suite — first case intake

The existing Next.js sidebar, compact cards, case types, county options, assignee labels, task UI, and other modules are preserved. Cases now use individual Supabase rows rather than replacing `kv_store.value` for the `cases` key.

## Run locally

Use Node.js 22 or newer. Run `npm ci`, copy `.env.example` to `.env.local`, fill in the project URL and **public** key, and run `npm run dev`. Open the Cases tab and sign in with an existing Supabase email/password account. There is no public signup UI. Provision approved users through Supabase Auth and disable public signups if this will be internal-only.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Either public key variable | Preferred public API key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Alternative | Legacy anon key; also used by pre-existing Edge Function features |

Case intake needs no service-role key, database password, AI key, or new Edge Function. Never place a secret/service-role key in a `NEXT_PUBLIC_` variable. Configure the variables in the deployment environment and rebuild; Next.js embeds public variables at build time. Unconfigured builds display setup guidance instead of crashing during module import.

## Database setup

The matching project discovered on October 25, 2026 is `hnr-title-suite` (`vlgiofdseyshaxnlbnbx`), currently **INACTIVE**. The verified API URL is `https://vlgiofdseyshaxnlbnbx.supabase.co`; public-key lookup also failed while the project was unavailable. A table inspection returned “Database is possibly not accessible at the moment.” No live schema changes were applied, and the existing schema/data could not be confirmed.

1. Restore/resume the intended project through the Supabase dashboard.
2. Inspect existing `public.cases`, policies, and `kv_store` before applying anything. The migration intentionally fails if a `cases` table already exists; reconcile that schema instead of dropping data.
3. Apply `supabase/migrations/20261025051948_case_intake.sql` through a reviewed migration or the SQL editor. It is transactional and additive. It requires the usual Supabase `auth.users`, `auth.uid()`, `authenticated`, and `anon` objects.
4. Ensure `public` is exposed through the Data API. Provision a test user; sign in, create a case, reload, and confirm it persists. Verify another user and a signed-out request cannot read it. Run Supabase security/performance advisors after applying.

### `public.cases` schema

| Column | Type / default | Rule |
| --- | --- | --- |
| `id` | UUID / `gen_random_uuid()` | Primary key; app supplies a stable UUID for retries |
| `user_id` | UUID / `auth.uid()` | Required FK to `auth.users.id`; authenticated callers cannot supply/change it |
| `title` | text | Required, trimmed, 1–200 characters |
| `type` | text | Probate, Quiet Title, Mineral Acquisition, Lease Negotiation, Title Curative, or Heirship Research |
| `county` | text / empty | Optional; at most 100 characters |
| `description` | text / empty | Optional; at most 10,000 characters |
| `assignee` | text / empty | Optional; at most 100 characters; display label, not an authorization identity |
| `status` | text / `Open` | This intake only creates Open cases |
| `tasks` | JSONB / `[]` | Existing task format; must be a JSON array |
| `version` | integer / `1` | Positive; used for optimistic task update checks |
| `created_at` | timestamptz / `now()` | Database timestamp |

RLS is enabled. Signed-in users can select/insert/update **their own** rows. Anonymous callers have no grants. Insert grants cover only intake fields and `id`; update grants cover only `tasks` and `version`. An index covers `(user_id, created_at DESC, id)`. There is no delete grant.

The assignee dropdown retains the repository's existing labels. Those labels have not been confirmed as actual HNR personnel. New cases default to Unassigned and an explicitly unspecified county; the form no longer silently displays the first county while saving an empty value. No new client, tract, legal-description, ownership, financial, or deadline fields were invented.

## Behavior and scope

- Native form submission plus shared trimmed-input validation; SQL constraints enforce core rules even if a caller bypasses the UI.
- Save is confirmed by `INSERT ... RETURNING`; only then does the UI add the returned record, reset the form, and show success.
- A synchronous lock and disabled controls prevent repeated submissions. The same UUID is retained after an uncertain response; retry first checks for an already-saved row. Failed submissions preserve input, and fields remain locked until retry confirmation or Cancel. Refresh before starting a different intake after an uncertain save.
- Cases load independently of legacy projects/doc logs/KV data. Load errors show a retry action rather than claiming the list is empty. Refresh and browser reload read persisted cases.
- Existing tasks save only their case row. A version mismatch reports a conflict and requires refresh instead of overwriting another session's edits. AI approval only reports success if the task save succeeds. Existing AI integration itself is not verified.
- Auth changes clear case-specific data/drafts. Case list entries support keyboard selection and intake fields have accessible labels.
- Legacy `kv_store` case data is untouched and is not automatically imported or displayed. Any import needs a reviewed owner mapping, validation of existing rows/tasks, and duplicate handling after the project becomes available.
- Other modules retain their existing storage and behavior; this work does not certify the entire application for production. Existing AI/Edge Function credentials and legacy table definitions are outside this intake schema.

## Decisions / access still needed

- Restore the intended Supabase project and configure its public API URL/key in the target environment. Account passwords should be provisioned securely, not posted in an issue or PR.
- Confirm approved account identities and whether cases should be shared by Brooks and Michael. The implemented default is per-user isolation. Shared HNR access needs a membership table and reviewed RLS policies; assignee text does not grant access.
- Confirm the existing county and team-label options and whether legacy cases should be imported. These do not block a new private intake.

## Validation

- `npm test`: four passing tests: input normalization/allowlist, invalid input rejection, Supabase transport save/retry/reload/error/conflict behavior, and the actual migration on embedded PostgreSQL (PGlite) including ownership/RLS and grants.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `npx playwright install chromium && npm run test:e2e`: browser regression covers sign-in, validation, failed-save retention, retry/double submission, refresh/reload, and read failure using mocked Supabase HTTP responses. Chromium download was blocked in the implementation environment, so this browser test has **not been executed successfully**. It does not replace a live Supabase smoke test.
- Live Supabase round-trip/advisors remain blocked by the inactive project. Embedded PostgreSQL and mocked transport tests are not proof of a production connection.

The final `npm audit --omit=dev` reports zero production dependency vulnerabilities. PostCSS is overridden to 8.5.31 to resolve the transitive advisories without moving beyond the React 18-compatible Next.js 15 line. Dependencies are locked. Next.js and the Supabase SDK were updated because the original versions had reported security advisories. A pre-existing duplicate comma in the AI chat request was also fixed so the app compiles.

## Exact changed files

- `.env.example` — public configuration template.
- `.eslintrc.json` — noninteractive Next lint configuration.
- `.gitignore` — exclude build/test artifacts and local Supabase metadata.
- `README.md` — schema, setup, verification, and outstanding decisions.
- `app/case-access.tsx` — sign-in, sign-out, configuration guidance, and session gate.
- `app/globals.css` — compact auth form and disabled button styling.
- `app/page.tsx` — intake integration, loading/error/retry states, accessible form/list, confirmed case/task writes, syntax repair.
- `lib/cases.ts` — validation and case persistence service.
- `lib/supabase.ts` — lazy, build-safe client initialization and public-key compatibility.
- `next-env.d.ts` — Next.js TypeScript declarations.
- `package.json` and `package-lock.json` — pinned runtime packages, reproducible dependencies, validation scripts.
- `playwright.config.ts` — isolated browser regression setup with test-only credentials.
- `supabase/migrations/20261025051948_case_intake.sql` — additive case table, constraints, index, grants, and RLS.
- `tests/case-service.test.ts` — Supabase transport and retry/conflict regression.
- `tests/cases.test.ts` — validator and actual PostgreSQL schema/security checks.
- `tests/intake.spec.ts` — browser intake regression.
- `tsconfig.json` — TypeScript build configuration.

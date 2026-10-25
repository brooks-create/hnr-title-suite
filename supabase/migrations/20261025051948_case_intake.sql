-- Additive: legacy kv_store cases remain untouched for reviewed migration later.
begin;
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (char_length(btrim(title)) between 1 and 200 and title = btrim(title)),
  type text not null check (type in ('Probate','Quiet Title','Mineral Acquisition','Lease Negotiation','Title Curative','Heirship Research')),
  county text not null default '' check (char_length(county) <= 100),
  description text not null default '' check (char_length(description) <= 10000),
  assignee text not null default '' check (char_length(assignee) <= 100),
  status text not null default 'Open' check (status = 'Open'),
  tasks jsonb not null default '[]'::jsonb check (jsonb_typeof(tasks) = 'array'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now()
);
create index cases_user_created_idx on public.cases (user_id, created_at desc, id);
alter table public.cases enable row level security;
revoke all on public.cases from anon, authenticated;
grant select on public.cases to authenticated;
grant insert (id, title, type, county, description, assignee) on public.cases to authenticated;
grant update (tasks, version) on public.cases to authenticated;
create policy cases_read_own on public.cases for select to authenticated
  using ((select auth.uid()) = user_id);
create policy cases_insert_own on public.cases for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy cases_update_own on public.cases for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
commit;

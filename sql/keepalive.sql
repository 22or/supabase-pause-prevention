-- Run once per project in Supabase Dashboard -> SQL Editor
-- Creates a tiny table the keep-alive script can UPDATE with the anon key.

create table if not exists public._keepalive (
  id int primary key default 1,
  pinged_at timestamptz not null default now(),
  constraint _keepalive_single_row check (id = 1)
);

insert into public._keepalive (id) values (1)
on conflict (id) do nothing;

alter table public._keepalive enable row level security;

drop policy if exists "keepalive anon select" on public._keepalive;
create policy "keepalive anon select"
  on public._keepalive
  for select
  to anon
  using (true);

drop policy if exists "keepalive anon update" on public._keepalive;
create policy "keepalive anon update"
  on public._keepalive
  for update
  to anon
  using (true)
  with check (true);

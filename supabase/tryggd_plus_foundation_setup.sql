create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  updated_at timestamptz not null default now()
);

alter table public.user_entitlements enable row level security;

drop policy if exists "Users can view own entitlements" on public.user_entitlements;
create policy "Users can view own entitlements"
on public.user_entitlements
for select
to authenticated
using (user_id = auth.uid());

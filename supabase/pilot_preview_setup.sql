-- Add pilot_preview_activated_at to profiles
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'pilot_preview_activated_at'
  ) then
    alter table public.profiles add column pilot_preview_activated_at timestamptz;
  end if;
end $$;

-- Global app config (singleton row, admin-managed via Supabase dashboard)
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  pilot_preview_enabled boolean not null default false,
  pilot_preview_campaign_id text,
  pilot_preview_ends_at timestamptz
);

insert into public.app_settings (id) values (1) on conflict do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Authenticated users can read app_settings" on public.app_settings;
create policy "Authenticated users can read app_settings"
  on public.app_settings for select to authenticated using (true);

-- RPC: validates preview window server-side before activating
create or replace function public.activate_pilot_preview()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
begin
  select * into cfg from app_settings where id = 1;

  if not coalesce(cfg.pilot_preview_enabled, false) then
    raise exception 'Pilot preview is not enabled';
  end if;

  if cfg.pilot_preview_ends_at is null or cfg.pilot_preview_ends_at <= now() then
    raise exception 'Pilot preview window is closed';
  end if;

  update profiles
    set pilot_preview_activated_at = now()
  where id = auth.uid()
    and pilot_preview_activated_at is null;
end;
$$;

grant execute on function public.activate_pilot_preview() to authenticated;

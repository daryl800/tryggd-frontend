-- help_requests_setup.sql
-- Creates the help_requests table for the Help mode feature (v4.7.0).
-- Stores CALL ME NOW and ASKED TO SEND MONEY? events.
-- Legacy generic reach-out check-ins (reach_out_status column in checkins) are
-- kept as-is for backward read-compat in Activity feed; no new rows of that type
-- will be created once the Help mode UI ships.

create table if not exists public.help_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null check (type in ('call_me_now', 'money_transfer_help')),
  created_at   timestamptz not null default now(),
  status       text not null default 'sent'
);

create index if not exists idx_help_requests_user_created
  on public.help_requests (user_id, created_at desc);

-- Row-level security
alter table public.help_requests enable row level security;

-- Users can read their own help requests
create policy "Users can read own help_requests"
  on public.help_requests for select
  using (auth.uid() = user_id);

-- Insert is controlled by the edge function (service-role key only).
-- Clients must not insert directly.

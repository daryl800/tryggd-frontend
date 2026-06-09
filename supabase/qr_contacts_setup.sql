-- QR-based contact addition
-- Users generate a short-lived token; scanning it auto-creates a mutual contact
-- without the normal request/accept flow (physical QR presentation = consent).

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.qr_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists qr_tokens_user_idx on public.qr_tokens (user_id);
create index if not exists qr_tokens_token_idx on public.qr_tokens (token);

alter table public.qr_tokens enable row level security;

drop policy if exists "Users can view own qr tokens" on public.qr_tokens;
create policy "Users can view own qr tokens"
  on public.qr_tokens for select
  to authenticated
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- generate_qr_token()
-- Called when the owner opens their QR code modal.
-- Returns a fresh token valid for 5 minutes.
-- Cleans up any expired tokens for this user first.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.generate_qr_token();
create or replace function public.generate_qr_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid;
  v_token    text;
  v_expires  timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- clean up old tokens for this user
  delete from public.qr_tokens
  where user_id = v_user_id;

  v_token   := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := now() + interval '5 minutes';

  insert into public.qr_tokens (user_id, token, expires_at)
  values (v_user_id, v_token, v_expires);

  return v_token;
end;
$$;

grant execute on function public.generate_qr_token() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- add_contact_via_qr(p_token text)
-- Called by the scanner after reading a QR code.
-- Validates the token, then directly inserts both sides of the contact
-- relationship (same end-state as accept_contact_request).
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.add_contact_via_qr(text);
create or replace function public.add_contact_via_qr(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanner_id uuid;
  v_owner_id   uuid;
  v_expires_at timestamptz;
begin
  v_scanner_id := auth.uid();
  if v_scanner_id is null then
    raise exception 'Not authenticated';
  end if;

  -- look up the token
  select user_id, expires_at
  into v_owner_id, v_expires_at
  from public.qr_tokens
  where token = p_token;

  if v_owner_id is null then
    return jsonb_build_object('error', 'QR code not found or already used');
  end if;

  if v_expires_at < now() then
    delete from public.qr_tokens where token = p_token;
    return jsonb_build_object('error', 'QR code has expired');
  end if;

  if v_owner_id = v_scanner_id then
    return jsonb_build_object('error', 'You cannot add yourself as a contact');
  end if;

  -- check contact limit (free tier = 3)
  if (select count(*) from public.contacts where owner_user_id = v_scanner_id) >= 3 then
    return jsonb_build_object('error', 'contact_limit_reached');
  end if;

  -- already connected?
  if exists (
    select 1 from public.contacts
    where owner_user_id = v_scanner_id and contact_user_id = v_owner_id
  ) then
    return jsonb_build_object('warning', 'already_connected');
  end if;

  -- create both sides of the contact relationship
  insert into public.contacts (owner_user_id, contact_user_id)
  values (v_scanner_id, v_owner_id)
  on conflict do nothing;

  insert into public.contacts (owner_user_id, contact_user_id)
  values (v_owner_id, v_scanner_id)
  on conflict do nothing;

  -- consume the token so it can't be reused
  delete from public.qr_tokens where token = p_token;

  -- return the owner's display info so the app can show a confirmation
  return jsonb_build_object(
    'success', true,
    'contact', (
      select jsonb_build_object(
        'display_name', display_name,
        'username', username,
        'avatar_url', avatar_url
      )
      from public.profiles
      where id = v_owner_id
    )
  );
end;
$$;

grant execute on function public.add_contact_via_qr(text) to authenticated;

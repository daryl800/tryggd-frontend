create extension if not exists pgcrypto with schema extensions;

create table if not exists public.contact_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_name text,
  suggested_username text,
  invite_kind text not null default 'signup' check (invite_kind in ('signup', 'recovery')),
  target_user_id uuid references auth.users(id) on delete cascade,
  invite_token text not null unique,
  invite_code_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'expired', 'revoked')),
  failed_attempts integer not null default 0,
  expires_at timestamptz not null,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contact_invites
  add column if not exists suggested_username text;
alter table public.contact_invites
  add column if not exists invite_kind text not null default 'signup';
alter table public.contact_invites
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade;

create index if not exists contact_invites_inviter_idx
  on public.contact_invites (inviter_user_id, created_at desc);

create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone)
  where phone is not null and phone <> '';

alter table public.contact_invites enable row level security;

drop policy if exists "Users can view own contact invites" on public.contact_invites;
create policy "Users can view own contact invites"
on public.contact_invites
for select
to authenticated
using (inviter_user_id = auth.uid());

drop function if exists public.create_contact_invite(text);
create or replace function public.create_contact_invite(p_suggested_username text default null)
returns table (
  invite_id uuid,
  invite_token text,
  invite_code text,
  expires_at timestamptz,
  suggested_username text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_code text;
  v_code_hash text;
  v_token text;
  v_expires_at timestamptz;
  v_suggested_username text;
  v_contact_count integer;
  v_contact_limit integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select count(*)
  into v_contact_count
  from public.contacts
  where owner_user_id = v_user_id;

  v_contact_limit := public.get_contact_limit(v_user_id);

  if v_contact_count >= v_contact_limit then
    raise exception 'Contact limit reached.';
  end if;

  v_suggested_username := nullif(lower(regexp_replace(trim(coalesce(p_suggested_username, '')), '\s+', '', 'g')), '');

  if v_suggested_username is not null then
    if v_suggested_username !~ '^[a-z0-9._]{3,24}$' then
      raise exception 'Suggested Tryggd ID must be 3-24 characters using lowercase letters, numbers, dots, or underscores.';
    end if;

    if exists (
      select 1
      from public.profiles
      where username = v_suggested_username
    ) then
      raise exception 'That Tryggd ID is already taken.';
    end if;
  end if;

  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    v_code_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

    exit when not exists (
      select 1
      from public.contact_invites ci
      where ci.invite_code_hash = v_code_hash
        and ci.status = 'pending'
        and ci.expires_at > now()
    );
  end loop;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires_at := now() + interval '7 days';

  return query
  insert into public.contact_invites (
    inviter_user_id,
    suggested_username,
    invite_kind,
    invite_token,
    invite_code_hash,
    expires_at
  )
  values (
    v_user_id,
    v_suggested_username,
    'signup',
    v_token,
    v_code_hash,
    v_expires_at
  )
  returning
    public.contact_invites.id,
    public.contact_invites.invite_token,
    v_code,
    public.contact_invites.expires_at,
    public.contact_invites.suggested_username;
end;
$$;

drop function if exists public.get_contact_invite(text);
create or replace function public.get_contact_invite(p_invite_token text)
returns table (
  invite_id uuid,
  invite_kind text,
  inviter_display_name text,
  invitee_name text,
  suggested_username text,
  target_user_id uuid,
  target_display_name text,
  expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contact_invites
  set
    status = 'expired',
    updated_at = now()
  where public.contact_invites.invite_token = p_invite_token
    and public.contact_invites.status = 'pending'
    and public.contact_invites.expires_at <= now();

  return query
  select
    ci.id,
    ci.invite_kind,
    coalesce(p.display_name, 'Tryggd contact'),
    ci.invitee_name,
    ci.suggested_username,
    ci.target_user_id,
    target_profile.display_name,
    ci.expires_at,
    ci.status
  from public.contact_invites ci
  join public.profiles p
    on p.id = ci.inviter_user_id
  left join public.profiles target_profile
    on target_profile.id = ci.target_user_id
  where ci.invite_token = p_invite_token;
end;
$$;

drop function if exists public.create_contact_recovery_invite(uuid);
create or replace function public.create_contact_recovery_invite(p_contact_user_id uuid)
returns table (
  invite_id uuid,
  invite_token text,
  invite_code text,
  expires_at timestamptz,
  target_display_name text,
  target_username text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_code text;
  v_code_hash text;
  v_token text;
  v_expires_at timestamptz;
  v_contact_profile record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_contact_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if not exists (
    select 1
    from public.contacts
    where owner_user_id = v_user_id
      and contact_user_id = p_contact_user_id
  ) then
    raise exception 'Contact not found.';
  end if;

  select display_name, username
  into v_contact_profile
  from public.profiles
  where id = p_contact_user_id;

  if v_contact_profile.username is null or trim(v_contact_profile.username) = '' then
    raise exception 'This contact does not have a Tryggd ID yet.';
  end if;

  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    v_code_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

    exit when not exists (
      select 1
      from public.contact_invites ci
      where ci.invite_code_hash = v_code_hash
        and ci.status = 'pending'
        and ci.expires_at > now()
    );
  end loop;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires_at := now() + interval '2 days';

  return query
  insert into public.contact_invites (
    inviter_user_id,
    invite_kind,
    target_user_id,
    invite_token,
    invite_code_hash,
    expires_at
  )
  values (
    v_user_id,
    'recovery',
    p_contact_user_id,
    v_token,
    v_code_hash,
    v_expires_at
  )
  returning
    public.contact_invites.id,
    public.contact_invites.invite_token,
    v_code,
    public.contact_invites.expires_at,
    coalesce(v_contact_profile.display_name, 'Tryggd contact')::text,
    v_contact_profile.username::text;
end;
$$;

drop function if exists public.verify_contact_invite_code(text, text);
create or replace function public.verify_contact_invite_code(p_invite_token text, p_code text)
returns table (
  is_valid boolean,
  error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.contact_invites%rowtype;
  v_hash text;
begin
  select *
  into v_invite
  from public.contact_invites
  where public.contact_invites.invite_token = p_invite_token;

  if not found then
    return query select false, 'Invite not found.';
    return;
  end if;

  if v_invite.status = 'claimed' then
    return query select false, 'This invite has already been used.';
    return;
  end if;

  if v_invite.status = 'revoked' then
    return query select false, 'This invite is no longer valid.';
    return;
  end if;

  if v_invite.expires_at <= now() then
    update public.contact_invites
    set
      status = 'expired',
      updated_at = now()
    where public.contact_invites.id = v_invite.id;

    return query select false, 'This invite has expired.';
    return;
  end if;

  if v_invite.failed_attempts >= 5 then
    update public.contact_invites
    set
      status = 'revoked',
      updated_at = now()
    where public.contact_invites.id = v_invite.id;

    return query select false, 'Too many incorrect attempts. Ask for a new invite.';
    return;
  end if;

  v_hash := encode(extensions.digest(trim(p_code), 'sha256'), 'hex');
  if v_hash <> v_invite.invite_code_hash then
    update public.contact_invites
    set
      failed_attempts = public.contact_invites.failed_attempts + 1,
      status = case
        when public.contact_invites.failed_attempts + 1 >= 5 then 'revoked'
        else public.contact_invites.status
      end,
      updated_at = now()
    where public.contact_invites.id = v_invite.id;

    return query select false, 'The code is incorrect.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

drop function if exists public.resolve_contact_invite_by_code(text);
create or replace function public.resolve_contact_invite_by_code(p_code text)
returns table (
  invite_token text,
  invite_kind text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_match_count integer;
begin
  update public.contact_invites
  set
    status = 'expired',
    updated_at = now()
  where public.contact_invites.status = 'pending'
    and public.contact_invites.expires_at <= now();

  v_hash := encode(extensions.digest(trim(p_code), 'sha256'), 'hex');

  select count(*)
  into v_match_count
  from public.contact_invites ci
  where ci.invite_code_hash = v_hash
    and ci.status = 'pending'
    and ci.expires_at > now();

  if v_match_count = 0 then
    return;
  end if;

  if v_match_count > 1 then
    raise exception 'Multiple invites matched this code. Ask for a new invite.';
  end if;

  return query
  select
    ci.invite_token,
    ci.invite_kind,
    ci.expires_at
  from public.contact_invites ci
  where ci.invite_code_hash = v_hash
    and ci.status = 'pending'
    and ci.expires_at > now()
  limit 1;
end;
$$;

grant execute on function public.create_contact_invite(text) to authenticated;
grant execute on function public.create_contact_recovery_invite(uuid) to authenticated;
grant execute on function public.get_contact_invite(text) to anon, authenticated;
grant execute on function public.verify_contact_invite_code(text, text) to anon, authenticated;
grant execute on function public.resolve_contact_invite_by_code(text) to anon, authenticated;

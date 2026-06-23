create or replace function public.get_contact_limit(p_user_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select case when coalesce(plan, 'free') = 'plus' then 999 else 5 end
     from public.user_entitlements
     where user_id = p_user_id),
    5
  );
$$;

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

grant execute on function public.get_contact_limit(uuid) to authenticated, service_role;
grant execute on function public.create_contact_invite(text) to authenticated;

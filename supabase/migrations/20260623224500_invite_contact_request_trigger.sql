-- Extend the claimed-invite trigger to create the accepted request marker too.

create or replace function public.ensure_claimed_invite_contacts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter_profile public.profiles%rowtype;
  v_invitee_profile public.profiles%rowtype;
begin
  if new.status <> 'claimed' or new.claimed_by_user_id is null then
    return new;
  end if;

  select *
  into v_inviter_profile
  from public.profiles
  where id = new.inviter_user_id;

  select *
  into v_invitee_profile
  from public.profiles
  where id = new.claimed_by_user_id;

  insert into public.contacts (
    owner_user_id,
    contact_user_id,
    contact_email,
    contact_display_name
  )
  values (
    new.inviter_user_id,
    new.claimed_by_user_id,
    coalesce(v_invitee_profile.username, v_invitee_profile.phone, ''),
    coalesce(v_invitee_profile.display_name, v_invitee_profile.username, new.invitee_name, 'Tryggd contact')
  )
  on conflict (owner_user_id, contact_user_id) do update
  set
    contact_email = coalesce(excluded.contact_email, public.contacts.contact_email),
    contact_display_name = coalesce(excluded.contact_display_name, public.contacts.contact_display_name);

  insert into public.contacts (
    owner_user_id,
    contact_user_id,
    contact_email,
    contact_display_name
  )
  values (
    new.claimed_by_user_id,
    new.inviter_user_id,
    coalesce(v_inviter_profile.username, v_inviter_profile.phone, ''),
    coalesce(v_inviter_profile.display_name, v_inviter_profile.username, 'Tryggd contact')
  )
  on conflict (owner_user_id, contact_user_id) do update
  set
    contact_email = coalesce(excluded.contact_email, public.contacts.contact_email),
    contact_display_name = coalesce(excluded.contact_display_name, public.contacts.contact_display_name);

  insert into public.contact_requests (
    sender_user_id,
    receiver_user_id,
    sender_email,
    sender_display_name,
    status,
    created_at,
    updated_at
  )
  select
    new.inviter_user_id,
    new.claimed_by_user_id,
    coalesce(v_inviter_profile.username, v_inviter_profile.phone, ''),
    coalesce(v_inviter_profile.display_name, v_inviter_profile.username, 'Tryggd contact'),
    'accepted',
    coalesce(new.claimed_at, now()),
    coalesce(new.claimed_at, now())
  where not exists (
    select 1
    from public.contact_requests cr
    where cr.status = 'accepted'
      and (
        (cr.sender_user_id = new.inviter_user_id and cr.receiver_user_id = new.claimed_by_user_id)
        or
        (cr.sender_user_id = new.claimed_by_user_id and cr.receiver_user_id = new.inviter_user_id)
      )
  );

  return new;
end;
$$;

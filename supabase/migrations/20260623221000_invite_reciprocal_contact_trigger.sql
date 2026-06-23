-- Guarantee invitation-created contacts exist in both directions when an invite is claimed.

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

  return new;
end;
$$;

drop trigger if exists ensure_claimed_invite_contacts_trigger on public.contact_invites;
create trigger ensure_claimed_invite_contacts_trigger
after insert or update of status, claimed_by_user_id
on public.contact_invites
for each row
when (new.status = 'claimed' and new.claimed_by_user_id is not null)
execute function public.ensure_claimed_invite_contacts();

insert into public.contacts (
  owner_user_id,
  contact_user_id,
  contact_email,
  contact_display_name
)
select
  ci.claimed_by_user_id,
  ci.inviter_user_id,
  coalesce(inviter.username, inviter.phone, ''),
  coalesce(inviter.display_name, inviter.username, 'Tryggd contact')
from public.contact_invites ci
left join public.profiles inviter
  on inviter.id = ci.inviter_user_id
where ci.status = 'claimed'
  and ci.claimed_by_user_id is not null
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
select
  ci.inviter_user_id,
  ci.claimed_by_user_id,
  coalesce(invitee.username, invitee.phone, ''),
  coalesce(invitee.display_name, invitee.username, ci.invitee_name, 'Tryggd contact')
from public.contact_invites ci
left join public.profiles invitee
  on invitee.id = ci.claimed_by_user_id
where ci.status = 'claimed'
  and ci.claimed_by_user_id is not null
on conflict (owner_user_id, contact_user_id) do update
set
  contact_email = coalesce(excluded.contact_email, public.contacts.contact_email),
  contact_display_name = coalesce(excluded.contact_display_name, public.contacts.contact_display_name);

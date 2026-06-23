-- Ensure claimed invitation-created contacts exist in both directions.
-- Some live rows only had inviter -> invitee, which lets Activity see updates
-- but prevents the invitee's check-ins from notifying the inviter.

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
  and not exists (
    select 1
    from public.contacts c
    where c.owner_user_id = ci.claimed_by_user_id
      and c.contact_user_id = ci.inviter_user_id
  )
on conflict (owner_user_id, contact_user_id) do nothing;

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
  and not exists (
    select 1
    from public.contacts c
    where c.owner_user_id = ci.inviter_user_id
      and c.contact_user_id = ci.claimed_by_user_id
  )
on conflict (owner_user_id, contact_user_id) do nothing;

-- Invitation contacts should have an accepted contact_requests marker, like QR
-- contacts do, so client-side request/contact reconciliation never treats them
-- as orphan contacts.

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
  ci.inviter_user_id,
  ci.claimed_by_user_id,
  coalesce(inviter.username, inviter.phone, ''),
  coalesce(inviter.display_name, inviter.username, 'Tryggd contact'),
  'accepted',
  coalesce(ci.claimed_at, now()),
  coalesce(ci.claimed_at, now())
from public.contact_invites ci
left join public.profiles inviter
  on inviter.id = ci.inviter_user_id
where ci.status = 'claimed'
  and ci.claimed_by_user_id is not null
  and not exists (
    select 1
    from public.contact_requests cr
    where cr.status = 'accepted'
      and (
        (cr.sender_user_id = ci.inviter_user_id and cr.receiver_user_id = ci.claimed_by_user_id)
        or
        (cr.sender_user_id = ci.claimed_by_user_id and cr.receiver_user_id = ci.inviter_user_id)
      )
  );

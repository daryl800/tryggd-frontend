-- Re-run reciprocal contact backfill after the contacts trigger was installed.

insert into public.contacts (
  owner_user_id,
  contact_user_id,
  contact_email,
  contact_display_name
)
select
  c.contact_user_id,
  c.owner_user_id,
  coalesce(owner_profile.username, owner_profile.phone, ''),
  coalesce(owner_profile.display_name, owner_profile.username, c.contact_display_name, 'Tryggd contact')
from public.contacts c
left join public.profiles owner_profile
  on owner_profile.id = c.owner_user_id
where c.owner_user_id <> c.contact_user_id
on conflict (owner_user_id, contact_user_id) do nothing;

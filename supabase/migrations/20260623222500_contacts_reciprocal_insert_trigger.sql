-- Stronger safety net: any contact inserted in one direction creates the
-- reciprocal contact row. This protects invite, QR, and future contact paths.

create or replace function public.ensure_reciprocal_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_profile public.profiles%rowtype;
begin
  if new.owner_user_id is null or new.contact_user_id is null then
    return new;
  end if;

  if new.owner_user_id = new.contact_user_id then
    return new;
  end if;

  select *
  into v_owner_profile
  from public.profiles
  where id = new.owner_user_id;

  insert into public.contacts (
    owner_user_id,
    contact_user_id,
    contact_email,
    contact_display_name
  )
  values (
    new.contact_user_id,
    new.owner_user_id,
    coalesce(v_owner_profile.username, v_owner_profile.phone, ''),
    coalesce(v_owner_profile.display_name, v_owner_profile.username, new.contact_display_name, 'Tryggd contact')
  )
  on conflict (owner_user_id, contact_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_reciprocal_contact_trigger on public.contacts;
create trigger ensure_reciprocal_contact_trigger
after insert on public.contacts
for each row
execute function public.ensure_reciprocal_contact();

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

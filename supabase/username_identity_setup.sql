alter table public.profiles
add column if not exists username text;

alter table public.profiles
drop constraint if exists profiles_username_format_check;

alter table public.profiles
add constraint profiles_username_format_check
check (
    username is null
    or username ~ '^[a-z0-9._]{3,24}$'
);

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null;

create or replace function public.find_contact_by_username(search_username text)
returns table (
    user_id uuid,
    email text,
    display_name text,
    username text
)
language sql
security definer
set search_path = public
as $$
    select
        p.id as user_id,
        au.email,
        p.display_name,
        p.username
    from public.profiles p
    join auth.users au
      on au.id = p.id
    where lower(p.username) = lower(trim(search_username))
    limit 1;
$$;

grant execute on function public.find_contact_by_username(text) to authenticated;

create or replace function public.find_contact_by_email(search_email text)
returns table (
    user_id uuid,
    email text,
    display_name text,
    username text
)
language sql
security definer
set search_path = public
as $$
    select
        p.id as user_id,
        au.email,
        p.display_name,
        p.username
    from public.profiles p
    join auth.users au
      on au.id = p.id
    where lower(au.email) = lower(trim(search_email))
    limit 1;
$$;

grant execute on function public.find_contact_by_email(text) to authenticated;

create or replace function public.get_contact_usernames(contact_ids uuid[])
returns table (
    id uuid,
    username text,
    display_name text
)
language sql
security definer
set search_path = public
as $$
    select
        p.id,
        p.username,
        p.display_name
    from public.profiles p
    where p.id = any(contact_ids);
$$;

grant execute on function public.get_contact_usernames(uuid[]) to authenticated;

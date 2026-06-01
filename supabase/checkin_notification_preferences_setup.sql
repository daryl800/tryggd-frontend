alter table public.contacts
add column if not exists checkin_notifications_enabled boolean not null default true;

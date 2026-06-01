alter table public.contacts
add column if not exists location_sharing_enabled boolean not null default false;

alter table public.checkins
add column if not exists location_latitude double precision,
add column if not exists location_longitude double precision,
add column if not exists location_accuracy_meters double precision;

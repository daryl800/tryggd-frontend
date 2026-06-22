-- Track whether the user has manually chosen a Home View mode.
-- When false (default), Plus activation auto-switches them to Enhanced.
-- When true, the user's explicit choice is respected even after Plus changes.
alter table public.user_settings
  add column if not exists home_style_user_selected boolean not null default false;

alter table public.user_settings
  add column if not exists home_style_user_selected boolean not null default false;

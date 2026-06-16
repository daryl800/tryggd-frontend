-- Rename home_style value 'detailed' to 'enhanced' to match the renamed Plus profile.
alter table public.user_settings drop constraint user_settings_home_style_check;

update public.user_settings set home_style = 'enhanced' where home_style = 'detailed';

alter table public.user_settings add constraint user_settings_home_style_check
  check (home_style in ('simple', 'enhanced'));

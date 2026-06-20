-- Expand home_presence check constraints to include all current statuses.
-- Adds: playing_sport, watching_movie, gathering, on_call, goodafternoon
-- Keeps: relaxing (backward compat with any existing rows)

do $$ begin
  alter table public.checkins
    drop constraint if exists checkins_home_presence_values;

  alter table public.checkins
    add constraint checkins_home_presence_values
    check (home_presence is null or home_presence in (
      'chilling', 'home', 'outside', 'busy', 'relaxing',
      'eating', 'exhausted', 'sleepy', 'daydreaming', 'having_fun',
      'playing_sport', 'watching_movie',
      'gathering', 'on_call',
      'goodmorning', 'goodafternoon', 'goodnight'
    ));
end $$;

do $$ begin
  alter table public.users_latest_checkin
    drop constraint if exists users_latest_checkin_home_presence_values;

  alter table public.users_latest_checkin
    add constraint users_latest_checkin_home_presence_values
    check (home_presence is null or home_presence in (
      'chilling', 'home', 'outside', 'busy', 'relaxing',
      'eating', 'exhausted', 'sleepy', 'daydreaming', 'having_fun',
      'playing_sport', 'watching_movie',
      'gathering', 'on_call',
      'goodmorning', 'goodafternoon', 'goodnight'
    ));
end $$;

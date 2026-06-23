-- Keep backend home_presence validation aligned with the current app status list.

do $$ begin
  alter table public.checkins
    drop constraint if exists checkins_home_presence_values;

  alter table public.checkins
    add constraint checkins_home_presence_values
    check (home_presence is null or home_presence in (
      'goodmorning',
      'home',
      'chilling',
      'outside',
      'at_school',
      'working',
      'goodafternoon',
      'eating',
      'on_call',
      'busy',
      'relaxing',
      'daydreaming',
      'gathering',
      'playing_sport',
      'having_fun',
      'watching_movie',
      'resting',
      'exhausted',
      'sleepy',
      'goodnight'
    ));
end $$;

do $$ begin
  alter table public.users_latest_checkin
    drop constraint if exists users_latest_checkin_home_presence_values;

  alter table public.users_latest_checkin
    add constraint users_latest_checkin_home_presence_values
    check (home_presence is null or home_presence in (
      'goodmorning',
      'home',
      'chilling',
      'outside',
      'at_school',
      'working',
      'goodafternoon',
      'eating',
      'on_call',
      'busy',
      'relaxing',
      'daydreaming',
      'gathering',
      'playing_sport',
      'having_fun',
      'watching_movie',
      'resting',
      'exhausted',
      'sleepy',
      'goodnight'
    ));
end $$;

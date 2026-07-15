-- Add heading_home_alone and hiking_alone to home_presence CHECK constraints.
-- Also backfills at_school and resting which were in the app type but never added to constraints.

do $$ begin
  alter table public.checkins
    drop constraint if exists checkins_home_presence_values;

  alter table public.checkins
    add constraint checkins_home_presence_values
    check (home_presence is null or home_presence in (
      'chilling', 'home', 'outside', 'at_school', 'busy', 'relaxing',
      'eating', 'exhausted', 'sleepy', 'daydreaming', 'having_fun',
      'playing_sport', 'watching_movie', 'resting',
      'gathering', 'on_call',
      'heading_home_alone', 'hiking_alone',
      'goodmorning', 'goodafternoon', 'goodnight'
    ));
end $$;

do $$ begin
  alter table public.users_latest_checkin
    drop constraint if exists users_latest_checkin_home_presence_values;

  alter table public.users_latest_checkin
    add constraint users_latest_checkin_home_presence_values
    check (home_presence is null or home_presence in (
      'chilling', 'home', 'outside', 'at_school', 'busy', 'relaxing',
      'eating', 'exhausted', 'sleepy', 'daydreaming', 'having_fun',
      'playing_sport', 'watching_movie', 'resting',
      'gathering', 'on_call',
      'heading_home_alone', 'hiking_alone',
      'goodmorning', 'goodafternoon', 'goodnight'
    ));
end $$;

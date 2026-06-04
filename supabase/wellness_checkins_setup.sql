alter table public.checkins
add column if not exists wellness_score smallint;

alter table public.users_latest_checkin
add column if not exists wellness_score smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'checkins_wellness_score_range'
  ) then
    alter table public.checkins
    add constraint checkins_wellness_score_range
    check (wellness_score is null or wellness_score between -5 and 5);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_latest_checkin_wellness_score_range'
  ) then
    alter table public.users_latest_checkin
    add constraint users_latest_checkin_wellness_score_range
    check (wellness_score is null or wellness_score between -5 and 5);
  end if;
end $$;

create or replace function public.upsert_daily_checkin(
  p_checkin_timezone text,
  p_local_day_start_utc timestamptz,
  p_local_day_end_utc timestamptz,
  p_wellness_score smallint default null,
  p_location_latitude double precision default null,
  p_location_longitude double precision default null,
  p_location_accuracy_meters double precision default null
)
returns table (
  id uuid,
  checked_in_at_utc timestamptz,
  wellness_score smallint,
  was_update boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_checkin_id uuid;
  v_checked_in_at_utc timestamptz;
  v_was_update boolean := false;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_local_day_start_utc is null or p_local_day_end_utc is null then
    raise exception 'Local day bounds are required';
  end if;

  if p_wellness_score is not null and (p_wellness_score < -5 or p_wellness_score > 5) then
    raise exception 'wellness_score must be between -5 and 5';
  end if;

  select c.id
  into v_checkin_id
  from public.checkins c
  where c.user_id = v_user_id
    and c.checked_in_at_utc >= p_local_day_start_utc
    and c.checked_in_at_utc < p_local_day_end_utc
  order by c.checked_in_at_utc desc
  limit 1
  for update;

  if v_checkin_id is not null then
    v_was_update := true;

    update public.checkins
    set
      checked_in_at_utc = now(),
      checkin_timezone = p_checkin_timezone,
      wellness_score = p_wellness_score,
      location_latitude = p_location_latitude,
      location_longitude = p_location_longitude,
      location_accuracy_meters = p_location_accuracy_meters
    where public.checkins.id = v_checkin_id
    returning public.checkins.checked_in_at_utc, public.checkins.wellness_score
    into v_checked_in_at_utc, wellness_score;
  else
    insert into public.checkins (
      user_id,
      checked_in_at_utc,
      checkin_timezone,
      wellness_score,
      location_latitude,
      location_longitude,
      location_accuracy_meters
    )
    values (
      v_user_id,
      now(),
      p_checkin_timezone,
      p_wellness_score,
      p_location_latitude,
      p_location_longitude,
      p_location_accuracy_meters
    )
    returning public.checkins.id, public.checkins.checked_in_at_utc, public.checkins.wellness_score
    into v_checkin_id, v_checked_in_at_utc, wellness_score;
  end if;

  insert into public.users_latest_checkin (
    user_id,
    last_checked_in_utc,
    checkin_timezone,
    wellness_score
  )
  values (
    v_user_id,
    v_checked_in_at_utc,
    p_checkin_timezone,
    p_wellness_score
  )
  on conflict (user_id)
  do update set
    last_checked_in_utc = excluded.last_checked_in_utc,
    checkin_timezone = excluded.checkin_timezone,
    wellness_score = excluded.wellness_score;

  id := v_checkin_id;
  checked_in_at_utc := v_checked_in_at_utc;
  was_update := v_was_update;

  return next;
end;
$$;

grant execute on function public.upsert_daily_checkin(
  text,
  timestamptz,
  timestamptz,
  smallint,
  double precision,
  double precision,
  double precision
) to authenticated;

-- Make the check-in row and users_latest_checkin snapshot atomic.
-- The notification trigger runs from users_latest_checkin, so all notification
-- fields must be present before last_checked_in_utc changes.

alter table public.checkins
add column if not exists trip_status text,
add column if not exists home_presence text,
add column if not exists reach_out_status text;

alter table public.users_latest_checkin
add column if not exists trip_status text,
add column if not exists home_presence text,
add column if not exists reach_out_status text;

create or replace function public.upsert_daily_checkin(
  p_checkin_timezone text,
  p_local_day_start_utc timestamptz,
  p_local_day_end_utc timestamptz,
  p_wellness_score smallint,
  p_location_latitude double precision,
  p_location_longitude double precision,
  p_location_accuracy_meters double precision,
  p_trip_status text,
  p_home_presence text,
  p_reach_out_status text
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
      location_accuracy_meters = p_location_accuracy_meters,
      trip_status = p_trip_status,
      home_presence = p_home_presence,
      reach_out_status = p_reach_out_status
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
      location_accuracy_meters,
      trip_status,
      home_presence,
      reach_out_status
    )
    values (
      v_user_id,
      now(),
      p_checkin_timezone,
      p_wellness_score,
      p_location_latitude,
      p_location_longitude,
      p_location_accuracy_meters,
      p_trip_status,
      p_home_presence,
      p_reach_out_status
    )
    returning public.checkins.id, public.checkins.checked_in_at_utc, public.checkins.wellness_score
    into v_checkin_id, v_checked_in_at_utc, wellness_score;
  end if;

  insert into public.users_latest_checkin (
    user_id,
    last_checked_in_utc,
    checkin_timezone,
    wellness_score,
    trip_status,
    home_presence,
    reach_out_status
  )
  values (
    v_user_id,
    v_checked_in_at_utc,
    p_checkin_timezone,
    p_wellness_score,
    p_trip_status,
    p_home_presence,
    p_reach_out_status
  )
  on conflict (user_id)
  do update set
    last_checked_in_utc = excluded.last_checked_in_utc,
    checkin_timezone = excluded.checkin_timezone,
    wellness_score = excluded.wellness_score,
    trip_status = excluded.trip_status,
    home_presence = excluded.home_presence,
    reach_out_status = excluded.reach_out_status;

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
  double precision,
  text,
  text,
  text
) to authenticated;

-- Keep the previous RPC signature available for installed app versions.
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
language sql
security definer
set search_path = public
as $$
  select *
  from public.upsert_daily_checkin(
    p_checkin_timezone,
    p_local_day_start_utc,
    p_local_day_end_utc,
    p_wellness_score,
    p_location_latitude,
    p_location_longitude,
    p_location_accuracy_meters,
    null,
    null,
    null
  );
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

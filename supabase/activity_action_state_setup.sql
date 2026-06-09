create or replace function public.get_activity_action_states(p_contact_ids uuid[])
returns table (
  user_id uuid,
  action_state text,
  recency_status text,
  action_reference_time timestamptz
)
language sql
security definer
set search_path = public
as $$
  with latest as (
    select
      ulc.user_id,
      ulc.last_checked_in_utc,
      coalesce(nullif(ulc.checkin_timezone, ''), 'UTC') as checkin_timezone
    from public.users_latest_checkin ulc
    where ulc.user_id = any(coalesce(p_contact_ids, '{}'::uuid[]))
  ),
  normalized as (
    select
      l.user_id,
      l.last_checked_in_utc,
      l.checkin_timezone,
      (l.last_checked_in_utc at time zone l.checkin_timezone)::date as checkin_local_date,
      (now() at time zone l.checkin_timezone)::date as current_local_date
    from latest l
  )
  select
    n.user_id,
    case
      when n.last_checked_in_utc is null then 'none'
      when n.checkin_local_date = n.current_local_date
        then 'like'
      when n.checkin_local_date = (n.current_local_date - 1)
        then 'today_check'
      else 'overdue_check'
    end as action_state,
    case
      when n.last_checked_in_utc is null then 'none'
      when n.checkin_local_date = n.current_local_date then 'today'
      when n.checkin_local_date = (n.current_local_date - 1) then 'yesterday'
      else 'older'
    end as recency_status,
    n.last_checked_in_utc as action_reference_time
  from normalized n;
$$;

grant execute on function public.get_activity_action_states(uuid[]) to authenticated;

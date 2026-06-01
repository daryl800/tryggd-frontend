create or replace function public.handle_checkin_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  function_url text;
  anon_key text;
  endpoint text;
begin
  select
    max(value) filter (where key = 'trigger_supabase_function_url'),
    max(value) filter (where key = 'trigger_supabase_anon_key')
  into function_url, anon_key
  from private.app_config;

  if function_url is null or anon_key is null then
    raise warning 'Trigger config missing in private.app_config';
    return new;
  end if;

  endpoint :=
    case
      when right(function_url, length('/send-checkin-notifications')) = '/send-checkin-notifications'
        then function_url
      else function_url || '/send-checkin-notifications'
    end;

  if (tg_op = 'INSERT')
     or (tg_op = 'UPDATE' and old.last_checked_in_utc is distinct from new.last_checked_in_utc)
  then
    perform net.http_post(
      url := endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'user_id', new.user_id,
        'checkin_time', new.last_checked_in_utc,
        'timezone', new.checkin_timezone
      )
    );
  end if;

  return new;
end;
$function$;

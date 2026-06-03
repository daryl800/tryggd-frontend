create or replace function public.timezone_display_label(input_timezone text)
returns text
language plpgsql
immutable
as $$
declare
  tz text;
  parts text[];
  fallback_label text;
begin
  tz := nullif(trim(input_timezone), '');

  if tz is null then
    return null;
  end if;

  case tz
    when 'UTC' then return 'UTC';
    when 'Asia/Shanghai' then return 'China';
    when 'Asia/Hong_Kong' then return 'Hong Kong';
    when 'Asia/Taipei' then return 'Taiwan';
    when 'Europe/Stockholm' then return 'Sweden';
    when 'Europe/Oslo' then return 'Norway';
    when 'Europe/Copenhagen' then return 'Denmark';
    when 'Europe/Helsinki' then return 'Finland';
    else
      parts := string_to_array(tz, '/');
      fallback_label := parts[array_length(parts, 1)];
      return replace(coalesce(fallback_label, tz), '_', ' ');
  end case;
end;
$$;

alter table public.checkins
add column if not exists checkin_timezone_label text;

alter table public.users_latest_checkin
add column if not exists checkin_timezone_label text;

create or replace function public.set_checkin_timezone_label()
returns trigger
language plpgsql
as $$
begin
  new.checkin_timezone_label := public.timezone_display_label(new.checkin_timezone);
  return new;
end;
$$;

drop trigger if exists set_checkin_timezone_label_on_checkins on public.checkins;
create trigger set_checkin_timezone_label_on_checkins
before insert or update of checkin_timezone
on public.checkins
for each row
execute function public.set_checkin_timezone_label();

drop trigger if exists set_checkin_timezone_label_on_users_latest_checkin on public.users_latest_checkin;
create trigger set_checkin_timezone_label_on_users_latest_checkin
before insert or update of checkin_timezone
on public.users_latest_checkin
for each row
execute function public.set_checkin_timezone_label();

update public.checkins
set checkin_timezone_label = public.timezone_display_label(checkin_timezone)
where checkin_timezone is not null
  and (
    checkin_timezone_label is null
    or checkin_timezone_label <> public.timezone_display_label(checkin_timezone)
  );

update public.users_latest_checkin
set checkin_timezone_label = public.timezone_display_label(checkin_timezone)
where checkin_timezone is not null
  and (
    checkin_timezone_label is null
    or checkin_timezone_label <> public.timezone_display_label(checkin_timezone)
  );

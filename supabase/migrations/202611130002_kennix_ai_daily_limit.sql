-- KENNIX AI: five questions per IP per Nigeria calendar day.
create table if not exists public.kennix_ai_daily_limits (
  key_hash text not null,
  usage_date date not null,
  request_count integer not null default 0,
  primary key (key_hash, usage_date)
);
alter table public.kennix_ai_daily_limits enable row level security;
revoke all on public.kennix_ai_daily_limits from anon, authenticated;

create or replace function public.kennix_ai_allow_daily_request(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_allowed boolean;
  v_today date;
begin
  v_hash := encode(digest(coalesce(p_ip, 'unknown'), 'sha256'), 'hex');
  v_today := (now() at time zone 'Africa/Lagos')::date;

  insert into public.kennix_ai_daily_limits(key_hash, usage_date, request_count)
  values (v_hash, v_today, 1)
  on conflict (key_hash, usage_date) do update
    set request_count = public.kennix_ai_daily_limits.request_count + 1
  returning request_count <= 5 into v_allowed;

  return v_allowed;
end;
$$;

revoke all on function public.kennix_ai_allow_daily_request(text) from public, anon, authenticated;
grant execute on function public.kennix_ai_allow_daily_request(text) to service_role;

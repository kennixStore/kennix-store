create extension if not exists pgcrypto with schema extensions;
create table if not exists public.kennix_ai_rate_limits (
 key_hash text primary key,
 window_started_at timestamptz not null,
 request_count integer not null default 0
);
alter table public.kennix_ai_rate_limits enable row level security;
revoke all on public.kennix_ai_rate_limits from anon, authenticated;
create or replace function public.kennix_ai_allow_request(p_ip text)
returns boolean language plpgsql security definer
set search_path=public,extensions
as $$
declare v_hash text; v_allowed boolean;
begin
 v_hash:=encode(digest(coalesce(p_ip,'unknown'),'sha256'),'hex');
 insert into public.kennix_ai_rate_limits(key_hash,window_started_at,request_count)
 values(v_hash,now(),1)
 on conflict(key_hash) do update
 set window_started_at=case when public.kennix_ai_rate_limits.window_started_at<now()-interval '1 minute' then now() else public.kennix_ai_rate_limits.window_started_at end,
 request_count=case when public.kennix_ai_rate_limits.window_started_at<now()-interval '1 minute' then 1 else public.kennix_ai_rate_limits.request_count+1 end
 returning request_count<=8 into v_allowed;
 return v_allowed;
end;
$$;
revoke all on function public.kennix_ai_allow_request(text) from public,anon,authenticated;
grant execute on function public.kennix_ai_allow_request(text) to service_role;

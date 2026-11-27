-- Authenticated, expiring presence leases. Apply after permission-control.sql.
begin;

create table if not exists public.workspace_presence (
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

create index if not exists workspace_presence_seen_idx on public.workspace_presence (seen_at);
alter table public.workspace_presence enable row level security;
revoke all on public.workspace_presence from public, anon, authenticated;

drop function if exists public.touch_workspace_presence(uuid);
create or replace function public.touch_workspace_presence(p_client_id uuid)
returns table(user_id uuid, display_name text, username text, avatar_url text)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or p_client_id is null or not public.monthly_tasks_active()
    or not public.drikapex_has_permission('workspace.presence') then
    raise exception 'Active authenticated account required' using errcode = '42501';
  end if;

  delete from public.workspace_presence where seen_at < now() - interval '1 day';
  insert into public.workspace_presence as presence (user_id, client_id, seen_at)
  values (actor, p_client_id, now())
  on conflict on constraint workspace_presence_pkey do update set seen_at = excluded.seen_at;

  return query
    select distinct profile.id, profile.display_name::text, profile.username::text, employee.avatar_url::text
    from public.workspace_presence presence
    join public.profiles profile on profile.id = presence.user_id and profile.status = 'ACTIVE'
    left join public.employees employee on employee.id = profile.employee_id
    where presence.seen_at > now() - interval '90 seconds'
      and exists (select 1 from public.user_roles ur where ur.user_id = presence.user_id);
end;
$$;

create or replace function public.leave_workspace_presence(p_client_id uuid)
returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  delete from public.workspace_presence
  where user_id = auth.uid() and client_id = p_client_id;
$$;

revoke all on function public.touch_workspace_presence(uuid) from public, anon, authenticated;
revoke all on function public.leave_workspace_presence(uuid) from public, anon, authenticated;
grant execute on function public.touch_workspace_presence(uuid) to authenticated;
grant execute on function public.leave_workspace_presence(uuid) to authenticated;
commit;

-- Apply after monthly-tasks.sql and, when installed, monthly-task-teams.sql.
-- Reapply after permission-control.sql to use Owner/capability authorization.
begin;

create table if not exists public.monthly_task_lock_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references public.profiles(id)
);
revoke all on public.monthly_task_lock_owner from public, anon, authenticated;

do $$
declare
  matched_count integer;
  owner_id uuid;
begin
  if not exists (select 1 from public.monthly_task_lock_owner) then
    select count(*) into matched_count
    from public.profiles
    where lower(btrim(username)) = 'dung0001' and status = 'ACTIVE';
    if matched_count <> 1 then
      raise exception 'Expected exactly one active owner profile';
    end if;
    select id into owner_id from public.profiles
    where lower(btrim(username)) = 'dung0001' and status = 'ACTIVE';
    if not exists (select 1 from public.user_roles where user_id = owner_id and role_id = 1) then
      raise exception 'Configured owner must have administrator role';
    end if;
    insert into public.monthly_task_lock_owner (user_id) values (owner_id);
  end if;
end;
$$;

create table if not exists public.monthly_task_month_locks (
  report_month date primary key check (extract(day from report_month) = 1),
  locked boolean not null default false,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.monthly_task_lock_owner enable row level security;
alter table public.monthly_task_month_locks enable row level security;
revoke all on public.monthly_task_month_locks from public, anon, authenticated;

create or replace function public.monthly_task_lock_status(p_month date)
returns table(locked boolean, can_manage boolean, past_month boolean)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.monthly_tasks_active()
    or not public.drikapex_has_permission('monthly_tasks.view') then
    raise exception 'Active authenticated account required' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Invalid report month' using errcode = '22023';
  end if;
  return query select
    coalesce((select l.locked from public.monthly_task_month_locks l where l.report_month = p_month), false),
    public.drikapex_is_owner()
      and public.drikapex_has_permission('monthly_tasks.lock'),
    p_month < date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date;
end;
$$;

create or replace function public.set_monthly_task_lock(p_month date, p_locked boolean)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.monthly_tasks_active() or not public.drikapex_is_owner()
    or not public.drikapex_has_permission('monthly_tasks.lock') then
    raise exception 'Only the designated owner can change month locks' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 or p_locked is null
    or p_month >= date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Only past months can be locked or unlocked' using errcode = '22023';
  end if;
  insert into public.monthly_task_month_locks (report_month, locked, changed_by)
  values (p_month, p_locked, auth.uid())
  on conflict (report_month) do update
  set locked = excluded.locked, changed_by = excluded.changed_by, changed_at = now();
end;
$$;

create or replace function public.monthly_task_assert_unlocked(p_month date)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare is_locked boolean;
begin
  insert into public.monthly_task_month_locks (report_month)
  values (p_month) on conflict (report_month) do nothing;
  select locked into is_locked from public.monthly_task_month_locks
  where report_month = p_month for update;
  if is_locked then
    raise exception 'This report month is locked' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.monthly_task_lock_guard()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  target_month date;
  old_month date;
  new_month date;
begin
  if tg_table_name = 'monthly_tasks' then
    if tg_op <> 'INSERT' then old_month := old.report_month; end if;
    if tg_op <> 'DELETE' then new_month := new.report_month; end if;
    for target_month in
      select distinct m from unnest(array[old_month, new_month]) m
      where m is not null order by m
    loop
      perform public.monthly_task_assert_unlocked(target_month);
    end loop;
  else
    if tg_op <> 'INSERT' then
      select report_month into old_month from public.monthly_tasks where id = old.task_id;
    end if;
    if tg_op <> 'DELETE' then
      select report_month into new_month from public.monthly_tasks where id = new.task_id;
    end if;
    for target_month in
      select distinct m from unnest(array[old_month, new_month]) m
      where m is not null order by m
    loop
      perform public.monthly_task_assert_unlocked(target_month);
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.monthly_task_lock_status(date) from public, anon;
revoke all on function public.set_monthly_task_lock(date, boolean) from public, anon;
revoke all on function public.monthly_task_assert_unlocked(date) from public, anon, authenticated;
revoke all on function public.monthly_task_lock_guard() from public, anon, authenticated;
grant execute on function public.monthly_task_lock_status(date) to authenticated;
grant execute on function public.set_monthly_task_lock(date, boolean) to authenticated;

drop trigger if exists monthly_task_lock_guard on public.monthly_tasks;
create trigger monthly_task_lock_guard before insert or update or delete on public.monthly_tasks
for each row execute function public.monthly_task_lock_guard();

do $$
begin
  if to_regclass('public.monthly_task_assignees') is not null then
    execute 'drop trigger if exists monthly_task_lock_guard on public.monthly_task_assignees';
    execute 'create trigger monthly_task_lock_guard before insert or update or delete on public.monthly_task_assignees for each row execute function public.monthly_task_lock_guard()';
  end if;
end;
$$;
commit;

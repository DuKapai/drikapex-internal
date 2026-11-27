-- Multi-assignee support. Apply after monthly-tasks.sql; permission-control.sql
-- must be applied before users rely on the capability checks below.
begin;

create table if not exists public.monthly_task_assignees (
  task_id bigint not null references public.monthly_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

insert into public.monthly_task_assignees (task_id, user_id, assigned_by)
select t.id, t.assignee_id, t.created_by
from public.monthly_tasks t
where t.assignee_id is not null
  and not exists (
    select 1 from public.monthly_task_assignees a
    where a.task_id = t.id and a.user_id = t.assignee_id
  )
on conflict (task_id, user_id) do nothing;

do $$
begin
  if to_regprocedure('public.monthly_task_lock_guard()') is not null then
    execute 'drop trigger if exists monthly_task_lock_guard on public.monthly_task_assignees';
    execute 'create trigger monthly_task_lock_guard before insert or update or delete on public.monthly_task_assignees for each row execute function public.monthly_task_lock_guard()';
  end if;
end;
$$;

create or replace function public.monthly_task_is_assigned(p_task_id bigint)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.monthly_task_assignees
    where task_id = p_task_id and user_id = auth.uid()
  );
$$;

revoke all on function public.monthly_task_is_assigned(bigint) from public, anon;
grant execute on function public.monthly_task_is_assigned(bigint) to authenticated;

alter table public.monthly_task_assignees enable row level security;
revoke all on public.monthly_task_assignees from public, anon, authenticated;
grant select on public.monthly_task_assignees to authenticated;

drop policy if exists monthly_task_assignees_select on public.monthly_task_assignees;
create policy monthly_task_assignees_select on public.monthly_task_assignees
  for select to authenticated
  using (
    public.monthly_tasks_active()
    and public.drikapex_has_permission('monthly_tasks.view')
    and (
      user_id = auth.uid()
      or public.monthly_task_is_assigned(task_id)
      or public.drikapex_has_permission('monthly_tasks.view_all')
    )
  );

drop policy if exists monthly_tasks_select on public.monthly_tasks;
create policy monthly_tasks_select on public.monthly_tasks
  for select to authenticated
  using (
    public.monthly_tasks_active()
    and public.drikapex_has_permission('monthly_tasks.view')
    and (
      public.monthly_task_is_assigned(id)
      or public.drikapex_has_permission('monthly_tasks.view_all')
    )
  );

drop policy if exists monthly_tasks_update on public.monthly_tasks;
create policy monthly_tasks_update on public.monthly_tasks
  for update to authenticated
  using (
    public.monthly_tasks_active()
    and public.drikapex_has_permission('monthly_tasks.edit')
    and (
      public.monthly_task_is_assigned(id)
      or public.drikapex_has_permission('monthly_tasks.assign')
    )
  )
  with check (
    public.monthly_tasks_active()
    and public.drikapex_has_permission('monthly_tasks.edit')
    and (
      public.monthly_task_is_assigned(id)
      or public.drikapex_has_permission('monthly_tasks.assign')
    )
  );

revoke insert on public.monthly_tasks from authenticated;
revoke insert (report_month, title, priority, assignee_id, status, work_date, note)
  on public.monthly_tasks from authenticated;
revoke update (assignee_id) on public.monthly_tasks from authenticated;

create or replace function public.create_monthly_task_with_assignees(
  p_report_month date,
  p_title text,
  p_priority text,
  p_status text,
  p_work_date date,
  p_note text,
  p_assignee_ids uuid[]
)
returns bigint
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  created_task_id bigint;
  primary_assignee uuid;
  target_id uuid;
begin
  if actor is null or not public.monthly_tasks_active()
    or not public.drikapex_has_permission('monthly_tasks.create') then
    raise exception 'Active authenticated account required' using errcode = '42501';
  end if;
  if p_report_month is null or extract(day from p_report_month) <> 1
    or p_title is null or length(btrim(p_title)) not between 1 and 2000 then
    raise exception 'Invalid task details' using errcode = '22023';
  end if;
  if p_assignee_ids is null or cardinality(p_assignee_ids) = 0
    or exists (select 1 from unnest(p_assignee_ids) id where id is null)
    or (select count(distinct id) from unnest(p_assignee_ids) id) <> cardinality(p_assignee_ids) then
    raise exception 'Select at least one unique assignee' using errcode = '22023';
  end if;
  if not public.drikapex_is_owner() and not (actor = any(p_assignee_ids)) then
    raise exception 'Include yourself when assigning colleagues' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(p_assignee_ids) selected(user_id)
    where not exists (
      select 1 from public.profiles profile
      where profile.id = selected.user_id and profile.status = 'ACTIVE'
        and exists (select 1 from public.user_roles ur where ur.user_id = profile.id)
    )
  ) then
    raise exception 'All assignees must have active profiles' using errcode = '22023';
  end if;

  primary_assignee := case when actor = any(p_assignee_ids) then actor else p_assignee_ids[1] end;
  insert into public.monthly_tasks (
    report_month, title, priority, assignee_id, status, work_date, note, created_by
  ) values (
    p_report_month, btrim(p_title), p_priority, primary_assignee, p_status, p_work_date, p_note, actor
  ) returning id into created_task_id;

  foreach target_id in array p_assignee_ids loop
    insert into public.monthly_task_assignees (task_id, user_id, assigned_by)
    values (created_task_id, target_id, actor);
  end loop;
  return created_task_id;
end;
$$;

create or replace function public.set_monthly_task_assignees(
  p_task_id bigint,
  p_assignee_ids uuid[],
  p_expected_assignee_ids uuid[]
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  target_id uuid;
  current_ids uuid[];
  expected_ids uuid[];
  locked_task_id bigint;
begin
  if actor is null or not public.monthly_tasks_active()
    or not public.drikapex_has_permission('monthly_tasks.edit') then
    raise exception 'Active authenticated account required' using errcode = '42501';
  end if;
  select id into locked_task_id
  from public.monthly_tasks where id = p_task_id
  for update;
  if locked_task_id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  select array_agg(user_id order by user_id) into current_ids
  from public.monthly_task_assignees where task_id = p_task_id;
  select array_agg(user_id order by user_id) into expected_ids
  from unnest(coalesce(p_expected_assignee_ids, '{}'::uuid[])) user_id;
  if current_ids is distinct from expected_ids then
    raise exception 'Assignee list changed; refresh before saving' using errcode = '40001';
  end if;
  if not public.drikapex_has_permission('monthly_tasks.assign')
    and not public.monthly_task_is_assigned(p_task_id) then
    raise exception 'You cannot edit this task' using errcode = '42501';
  end if;
  if p_assignee_ids is null or cardinality(p_assignee_ids) = 0
    or exists (select 1 from unnest(p_assignee_ids) id where id is null)
    or (select count(distinct id) from unnest(p_assignee_ids) id) <> cardinality(p_assignee_ids) then
    raise exception 'Select at least one unique assignee' using errcode = '22023';
  end if;
  if not public.drikapex_is_owner() and not (actor = any(p_assignee_ids)) then
    raise exception 'Include yourself when assigning colleagues' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(p_assignee_ids) selected(user_id)
    where not exists (
      select 1 from public.profiles profile
      where profile.id = selected.user_id and profile.status = 'ACTIVE'
        and exists (select 1 from public.user_roles ur where ur.user_id = profile.id)
    )
  ) then
    raise exception 'All assignees must have active profiles' using errcode = '22023';
  end if;

  delete from public.monthly_task_assignees WHERE task_id = p_task_id;
  foreach target_id in array p_assignee_ids loop
    insert into public.monthly_task_assignees (task_id, user_id, assigned_by)
    values (p_task_id, target_id, actor);
  end loop;
  update public.monthly_tasks
  set assignee_id = case when actor = any(p_assignee_ids) then actor else p_assignee_ids[1] end
  where id = p_task_id;
end;
$$;

revoke all on function public.create_monthly_task_with_assignees(date, text, text, text, date, text, uuid[]) from public, anon;
revoke all on function public.set_monthly_task_assignees(bigint, uuid[], uuid[]) from public, anon;
grant execute on function public.create_monthly_task_with_assignees(date, text, text, text, date, text, uuid[]) to authenticated;
grant execute on function public.set_monthly_task_assignees(bigint, uuid[], uuid[]) to authenticated;

commit;

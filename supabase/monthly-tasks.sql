-- Apply after permission-control.sql and review the permission defaults first.
begin;

create table if not exists public.monthly_tasks (
  id bigint generated always as identity primary key,
  report_month date not null check (extract(day from report_month) = 1),
  title text not null check (length(btrim(title)) between 1 and 2000),
  priority text,
  assignee_id uuid references public.profiles(id) on delete set null,
  source_assignee text,
  status text,
  work_date date,
  note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_key text unique
);

create index if not exists monthly_tasks_month_assignee_idx
  on public.monthly_tasks (report_month, assignee_id);

alter table public.monthly_tasks enable row level security;

create or replace function public.monthly_tasks_active()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
  ) and public.drikapex_actor_level() is not null;
$$;

create or replace function public.list_monthly_task_people()
returns table(id uuid, display_name text, username text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select profile.id, profile.display_name, profile.username
  from public.profiles profile
  where profile.status = 'ACTIVE'
    and exists (select 1 from public.user_roles ur where ur.user_id = profile.id)
    and public.monthly_tasks_active()
  order by coalesce(profile.display_name, profile.username);
$$;

revoke all on function public.monthly_tasks_active() from public;
grant execute on function public.monthly_tasks_active() to authenticated;
revoke all on function public.list_monthly_task_people() from public, anon;
grant execute on function public.list_monthly_task_people() to authenticated;

drop policy if exists monthly_tasks_select on public.monthly_tasks;
create policy monthly_tasks_select on public.monthly_tasks for select to authenticated
  using (public.monthly_tasks_active() and
    public.drikapex_has_permission('monthly_tasks.view')
    and (assignee_id = auth.uid() or public.drikapex_has_permission('monthly_tasks.view_all')));

drop policy if exists monthly_tasks_insert on public.monthly_tasks;
create policy monthly_tasks_insert on public.monthly_tasks for insert to authenticated
  with check (
    public.monthly_tasks_active()
    and public.drikapex_has_permission('monthly_tasks.create')
    and created_by = auth.uid()
    and (assignee_id = auth.uid() or public.drikapex_has_permission('monthly_tasks.assign'))
    and exists (select 1 from public.profiles p where p.id = assignee_id and p.status = 'ACTIVE')
  );

drop policy if exists monthly_tasks_update on public.monthly_tasks;
create policy monthly_tasks_update on public.monthly_tasks for update to authenticated
  using (public.monthly_tasks_active() and
    public.drikapex_has_permission('monthly_tasks.edit')
    and (assignee_id = auth.uid() or public.drikapex_has_permission('monthly_tasks.assign')))
  with check (
    public.monthly_tasks_active()
    and public.drikapex_has_permission('monthly_tasks.edit')
    and (assignee_id = auth.uid() or public.drikapex_has_permission('monthly_tasks.assign'))
    and exists (select 1 from public.profiles p where p.id = assignee_id and p.status = 'ACTIVE')
  );

drop policy if exists monthly_tasks_delete on public.monthly_tasks;
create policy monthly_tasks_delete on public.monthly_tasks for delete to authenticated
  using (public.monthly_tasks_active() and public.drikapex_has_permission('monthly_tasks.delete'));

revoke all on public.monthly_tasks from anon, authenticated;
grant select, delete on public.monthly_tasks to authenticated;
grant insert (report_month, title, priority, assignee_id, status, work_date, note)
  on public.monthly_tasks to authenticated;
grant update (report_month, title, priority, assignee_id, status, work_date, note)
  on public.monthly_tasks to authenticated;
grant usage, select on sequence public.monthly_tasks_id_seq to authenticated;

commit;

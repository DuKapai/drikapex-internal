-- Apply after monthly-task-teams.sql and monthly-task-locks.sql.
-- Apply permission-control.sql before enabling the capability checks below.
begin;

alter table public.monthly_tasks add column if not exists group_name text not null
  default 'CÔNG VIỆC CHUNG' check (length(btrim(group_name)) between 1 and 100);
grant update (group_name) on public.monthly_tasks to authenticated;

create or replace function public.create_grouped_monthly_task(
  p_report_month date, p_title text, p_priority text, p_status text,
  p_work_date date, p_note text, p_assignee_ids uuid[], p_group_name text
) returns bigint
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare task_id bigint;
begin
  if p_group_name is null or length(btrim(p_group_name)) not between 1 and 100 then
    raise exception 'Invalid task group' using errcode = '22023';
  end if;
  -- Reuse the existing active-account, assignment and month-lock checks atomically.
  task_id := public.create_monthly_task_with_assignees(
    p_report_month, p_title, p_priority, p_status, p_work_date, p_note, p_assignee_ids
  );
  update public.monthly_tasks set group_name = btrim(p_group_name) where id = task_id;
  return task_id;
end;
$$;
revoke all on function public.create_grouped_monthly_task(date, text, text, text, date, text, uuid[], text) from public, anon;
grant execute on function public.create_grouped_monthly_task(date, text, text, text, date, text, uuid[], text) to authenticated;

create table if not exists public.monthly_report_notes (
  id uuid primary key default gen_random_uuid(),
  report_month date not null check (extract(day from report_month) = 1),
  kind text not null check (kind in ('difficulty', 'proposal')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists monthly_report_notes_month_idx
  on public.monthly_report_notes (report_month, created_at, id);
alter table public.monthly_report_notes enable row level security;
-- Read through the RPC so a peer cannot recover a difficulty author's identity.
revoke all on public.monthly_report_notes from public, anon, authenticated;

create or replace function public.monthly_report_note_lock_guard()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare target_month date;
begin
  for target_month in
    select distinct m from unnest(array[
      case when tg_op <> 'INSERT' then old.report_month end,
      case when tg_op <> 'DELETE' then new.report_month end
    ]) m where m is not null order by m
  loop
    perform public.monthly_task_assert_unlocked(target_month);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.monthly_report_note_lock_guard() from public, anon, authenticated;
drop trigger if exists monthly_report_note_lock_guard on public.monthly_report_notes;
create trigger monthly_report_note_lock_guard
before insert or update or delete on public.monthly_report_notes
for each row execute function public.monthly_report_note_lock_guard();

create or replace function public.list_monthly_report_notes(p_month date)
returns table (
  id uuid, report_month date, kind text, body text,
  author_name text, mine boolean, can_edit boolean, revision integer
)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.monthly_tasks_active()
    or not public.drikapex_has_permission('monthly_report_notes.view') then
    raise exception 'Active authenticated account required' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Invalid report month' using errcode = '22023';
  end if;
  return query
    select n.id, n.report_month, n.kind, n.body,
      case when n.kind = 'proposal' or n.author_id = auth.uid()
        or public.drikapex_has_permission('monthly_report_notes.view_author')
        then coalesce(p.display_name, p.username)::text else null::text end,
      coalesce(n.author_id = auth.uid(), false),
      coalesce(n.author_id = auth.uid(), false)
        or public.drikapex_has_permission('monthly_report_notes.edit_all'),
      n.revision
    from public.monthly_report_notes n
    left join public.profiles p on p.id = n.author_id
    where n.report_month = p_month
    order by n.created_at, n.id;
end;
$$;

create or replace function public.save_monthly_report_note(
  p_id uuid, p_month date, p_kind text, p_body text, p_expected_revision integer
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  current_note public.monthly_report_notes%rowtype;
  saved_id uuid;
begin
  if not public.monthly_tasks_active()
    or not public.drikapex_has_permission('monthly_report_notes.view')
    or not public.drikapex_has_permission(
      case when p_id is null then 'monthly_report_notes.create'
           else 'monthly_report_notes.edit' end
    ) then
    raise exception 'Active authenticated account required' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1
    or p_kind is null or p_kind not in ('difficulty', 'proposal')
    or p_body is null or length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Invalid report note' using errcode = '22023';
  end if;
  if p_id is null then
    if p_expected_revision is not null then
      raise exception 'Invalid new note revision' using errcode = '22023';
    end if;
    insert into public.monthly_report_notes(report_month, kind, body, author_id)
    values (p_month, p_kind, btrim(p_body), auth.uid()) returning id into saved_id;
    return saved_id;
  end if;
  select * into current_note from public.monthly_report_notes where id = p_id for update;
  if not found then
    raise exception 'Report note changed; refresh before saving' using errcode = '40001';
  end if;
  if current_note.author_id is distinct from auth.uid()
    and not public.drikapex_has_permission('monthly_report_notes.edit_all') then
    raise exception 'You cannot edit this report note' using errcode = '42501';
  end if;
  if current_note.revision is distinct from p_expected_revision
    or current_note.report_month <> p_month or current_note.kind <> p_kind then
    raise exception 'Report note changed; refresh before saving' using errcode = '40001';
  end if;
  update public.monthly_report_notes
  set body = btrim(p_body), revision = revision + 1, updated_at = now()
  where id = p_id;
  return p_id;
end;
$$;

create or replace function public.delete_monthly_report_note(p_id uuid, p_expected_revision integer)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare current_note public.monthly_report_notes%rowtype;
begin
  if not public.monthly_tasks_active()
    or not public.drikapex_has_permission('monthly_report_notes.delete') then
    raise exception 'Active authenticated account required' using errcode = '42501';
  end if;
  select * into current_note from public.monthly_report_notes where id = p_id for update;
  if not found then
    raise exception 'Report note changed; refresh before deleting' using errcode = '40001';
  end if;
  if current_note.author_id is distinct from auth.uid()
    and not public.drikapex_has_permission('monthly_report_notes.edit_all') then
    raise exception 'You cannot delete this report note' using errcode = '42501';
  end if;
  if current_note.revision is distinct from p_expected_revision then
    raise exception 'Report note changed; refresh before deleting' using errcode = '40001';
  end if;
  delete from public.monthly_report_notes where id = p_id;
end;
$$;

revoke all on function public.list_monthly_report_notes(date) from public, anon;
revoke all on function public.save_monthly_report_note(uuid, date, text, text, integer) from public, anon;
revoke all on function public.delete_monthly_report_note(uuid, integer) from public, anon;
grant execute on function public.list_monthly_report_notes(date) to authenticated;
grant execute on function public.save_monthly_report_note(uuid, date, text, text, integer) to authenticated;
grant execute on function public.delete_monthly_report_note(uuid, integer) to authenticated;
commit;

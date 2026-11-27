-- Apply after monthly-tasks.sql; does not replace task policies or data.
begin;

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

revoke all on function public.list_monthly_task_people() from public, anon;
grant execute on function public.list_monthly_task_people() to authenticated;
commit;

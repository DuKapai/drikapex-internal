-- Optional security setup for the existing Drikapex schema.
-- Review this script and run it once in the Supabase SQL editor.
-- It does not create, drop, or alter application tables or data.

create or replace function public.drikapex_actor_level()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select min(r.id)
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles profile on profile.id = ur.user_id
  where ur.user_id = auth.uid()
    and profile.status = 'ACTIVE';
$$;

create or replace function public.drikapex_can_manage_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      public.drikapex_actor_level() = 1
      and target_user_id <> auth.uid()
    )
    or (
      public.drikapex_actor_level() = 2
      and target_user_id <> auth.uid()
      and not exists (
        select 1
        from public.user_roles target_assignment
        join public.roles target_role on target_role.id = target_assignment.role_id
        where target_assignment.user_id = target_user_id
          and target_role.id <= 2
      )
    ),
    false
  );
$$;

create or replace function public.drikapex_can_manage_role(target_role_id bigint)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    public.drikapex_actor_level() = 1
    or (
      public.drikapex_actor_level() = 2
      and target_role_id > 2
    ),
    false
  );
$$;

create or replace function public.drikapex_has_permission(required_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and p.code = required_code
      and exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.status = 'ACTIVE'
      )
  );
$$;

revoke all on function public.drikapex_has_permission(text) from public;
grant execute on function public.drikapex_has_permission(text) to authenticated;
revoke all on function public.drikapex_actor_level() from public;
revoke all on function public.drikapex_can_manage_user(uuid) from public;
revoke all on function public.drikapex_can_manage_role(bigint) from public;
grant execute on function public.drikapex_actor_level() to authenticated;
grant execute on function public.drikapex_can_manage_user(uuid) to authenticated;
grant execute on function public.drikapex_can_manage_role(bigint) to authenticated;

-- Role id 1 is the administrator, id 2 the manager; manager access is full
-- except that account and role changes are restricted to levels below 2.
insert into public.role_permissions (role_id, permission_id)
select manager.id, permission.id
from public.roles manager
cross join public.permissions permission
where manager.id = 2
  and manager.code = 'MANAGER'
on conflict do nothing;

alter table public.employees enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.document_categories enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.audit_logs enable row level security;

grant select on public.employees, public.profiles, public.roles,
  public.permissions, public.user_roles, public.role_permissions,
  public.document_categories, public.documents, public.notifications,
  public.notification_reads, public.audit_logs to authenticated;
revoke update on public.profiles from authenticated;
grant update (employee_id, display_name, username, status)
  on public.profiles to authenticated;
grant insert, update, delete on public.employees, public.documents,
  public.notifications to authenticated;
grant insert, update on public.notification_reads to authenticated;
grant usage, select on sequence public.employees_id_seq,
  public.documents_id_seq, public.notifications_id_seq to authenticated;

drop policy if exists drikapex_employees_read on public.employees;
drop policy if exists drikapex_employees_create on public.employees;
drop policy if exists drikapex_employees_edit on public.employees;
drop policy if exists drikapex_employees_delete on public.employees;
create policy drikapex_employees_read on public.employees
  for select to authenticated
  using (public.drikapex_has_permission('personnel.view'));
create policy drikapex_employees_create on public.employees
  for insert to authenticated
  with check (public.drikapex_has_permission('personnel.create'));
create policy drikapex_employees_edit on public.employees
  for update to authenticated
  using (public.drikapex_has_permission('personnel.edit'))
  with check (public.drikapex_has_permission('personnel.edit'));
create policy drikapex_employees_delete on public.employees
  for delete to authenticated
  using (public.drikapex_has_permission('personnel.delete'));

drop policy if exists drikapex_profiles_read on public.profiles;
drop policy if exists drikapex_profiles_update on public.profiles;
create policy drikapex_profiles_read on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (
      public.drikapex_actor_level() <= 2
      and public.drikapex_has_permission('users.view')
    )
    or public.drikapex_has_permission('personnel.view')
  );
create policy drikapex_profiles_update on public.profiles
  for update to authenticated
  using (public.drikapex_can_manage_user(id))
  with check (public.drikapex_can_manage_user(id));

drop policy if exists drikapex_roles_read on public.roles;
drop policy if exists drikapex_permissions_read on public.permissions;
drop policy if exists drikapex_user_roles_read on public.user_roles;
drop policy if exists drikapex_user_roles_manage on public.user_roles;
drop policy if exists drikapex_user_roles_insert on public.user_roles;
drop policy if exists drikapex_user_roles_delete on public.user_roles;
drop policy if exists drikapex_role_permissions_read on public.role_permissions;
drop policy if exists drikapex_role_permissions_manage on public.role_permissions;
create policy drikapex_roles_read on public.roles
  for select to authenticated
  using (
    (
      public.drikapex_actor_level() <= 2
      and public.drikapex_has_permission('roles.view')
    )
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role_id = roles.id
    )
  );
create policy drikapex_permissions_read on public.permissions
  for select to authenticated
  using (
    (
      public.drikapex_actor_level() <= 2
      and public.drikapex_has_permission('roles.view')
    )
    or exists (
      select 1
      from public.role_permissions rp
      join public.user_roles ur on ur.role_id = rp.role_id
      where ur.user_id = auth.uid()
        and rp.permission_id = permissions.id
    )
  );
create policy drikapex_user_roles_read on public.user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.drikapex_actor_level() <= 2
      and public.drikapex_has_permission('users.view')
    )
    or (
      public.drikapex_actor_level() <= 2
      and public.drikapex_has_permission('roles.view')
    )
  );
create policy drikapex_user_roles_insert on public.user_roles
  for insert to authenticated
  with check (
    public.drikapex_can_manage_user(user_id)
    and public.drikapex_can_manage_role(role_id)
  );
create policy drikapex_user_roles_delete on public.user_roles
  for delete to authenticated
  using (
    public.drikapex_can_manage_user(user_id)
    and public.drikapex_can_manage_role(role_id)
  );
create policy drikapex_role_permissions_read on public.role_permissions
  for select to authenticated
  using (
    (
      public.drikapex_actor_level() <= 2
      and public.drikapex_has_permission('roles.view')
    )
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role_id = role_permissions.role_id
    )
  );
create policy drikapex_role_permissions_manage on public.role_permissions
  for all to authenticated
  using (public.drikapex_can_manage_role(role_id))
  with check (public.drikapex_can_manage_role(role_id));
grant insert, update, delete on public.user_roles,
  public.role_permissions to authenticated;

drop policy if exists drikapex_categories_read on public.document_categories;
create policy drikapex_categories_read on public.document_categories
  for select to authenticated
  using (public.drikapex_has_permission('documents.view'));

drop policy if exists drikapex_documents_read on public.documents;
drop policy if exists drikapex_documents_create on public.documents;
drop policy if exists drikapex_documents_edit on public.documents;
drop policy if exists drikapex_documents_delete on public.documents;
create policy drikapex_documents_read on public.documents
  for select to authenticated
  using (public.drikapex_has_permission('documents.view'));
create policy drikapex_documents_create on public.documents
  for insert to authenticated
  with check (
    public.drikapex_has_permission('documents.create')
    and (created_by is null or created_by = auth.uid())
    and (updated_by is null or updated_by = auth.uid())
  );
create policy drikapex_documents_edit on public.documents
  for update to authenticated
  using (public.drikapex_has_permission('documents.edit'))
  with check (
    public.drikapex_has_permission('documents.edit')
    and (updated_by is null or updated_by = auth.uid())
  );
create policy drikapex_documents_delete on public.documents
  for delete to authenticated
  using (public.drikapex_has_permission('documents.delete'));

drop policy if exists drikapex_notifications_read on public.notifications;
drop policy if exists drikapex_notifications_create on public.notifications;
drop policy if exists drikapex_notifications_edit on public.notifications;
drop policy if exists drikapex_notifications_delete on public.notifications;
create policy drikapex_notifications_read on public.notifications
  for select to authenticated
  using (public.drikapex_has_permission('notifications.view'));
create policy drikapex_notifications_create on public.notifications
  for insert to authenticated
  with check (
    public.drikapex_has_permission('notifications.create')
    and (created_by is null or created_by = auth.uid())
  );
create policy drikapex_notifications_edit on public.notifications
  for update to authenticated
  using (public.drikapex_has_permission('notifications.edit'))
  with check (public.drikapex_has_permission('notifications.edit'));
create policy drikapex_notifications_delete on public.notifications
  for delete to authenticated
  using (public.drikapex_has_permission('notifications.delete'));

drop policy if exists drikapex_notification_reads_select on public.notification_reads;
drop policy if exists drikapex_notification_reads_insert on public.notification_reads;
drop policy if exists drikapex_notification_reads_update on public.notification_reads;
create policy drikapex_notification_reads_select on public.notification_reads
  for select to authenticated
  using (user_id = auth.uid());
create policy drikapex_notification_reads_insert on public.notification_reads
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.drikapex_has_permission('notifications.view')
  );
create policy drikapex_notification_reads_update on public.notification_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists drikapex_audit_logs_read on public.audit_logs;
create policy drikapex_audit_logs_read on public.audit_logs
  for select to authenticated
  using (
    public.drikapex_actor_level() <= 2
    and public.drikapex_has_permission('audit.view')
  );

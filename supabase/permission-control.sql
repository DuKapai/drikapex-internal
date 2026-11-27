-- Consolidated permission control center. Apply after rls-policies.sql and,
-- when installed, monthly-task-locks.sql (which stores the designated owner).
--
-- This migration makes public.drikapex_has_permission the single source of
-- truth for every capability-aware RLS policy, RPC and Edge Function:
--   effective = owner ? always true
--             : active profile ? (per-user override, else role default)
--             : false
-- It promotes the current managers into ADMIN while keeping MANAGER available
-- for future employees without dashboard access, records per-user overrides, flags
-- sensitive capabilities, and adds an owner-reviewed approval queue so a
-- non-owner administrator cannot silently weaken another administrator or
-- remove a sensitive capability. An enforcement map lets the owner supervise
-- where each capability is checked across RLS, RPCs and Edge Functions.
--
-- Rerunnable. Does not delete accounts or application data.
begin;

-- The designated owner (single account) is implicitly granted every
-- capability and is the sole approver. monthly-task-locks.sql stores this
-- identity separately from the shared administrator role.
create or replace function public.drikapex_is_owner_user(p_user uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p_user is not null
    and exists (
      select 1 from public.monthly_task_lock_owner o
      join public.profiles p on p.id = o.user_id and p.status = 'ACTIVE'
      join public.user_roles ur on ur.user_id = p.id and ur.role_id = 1
      where o.user_id = p_user
    );
$$;
revoke all on function public.drikapex_is_owner_user(uuid) from public, anon, authenticated;
grant execute on function public.drikapex_is_owner_user(uuid) to service_role;

create or replace function public.drikapex_is_owner()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select public.drikapex_is_owner_user(auth.uid()); $$;
revoke all on function public.drikapex_is_owner() from public, anon;
grant execute on function public.drikapex_is_owner() to authenticated, service_role;

create or replace function public.password_recovery_is_owner(p_actor uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select public.drikapex_is_owner_user(p_actor); $$;
revoke all on function public.password_recovery_is_owner(uuid) from public, anon, authenticated;
grant execute on function public.password_recovery_is_owner(uuid) to service_role;

do $$
begin
  if (select count(*) from public.monthly_task_lock_owner) <> 1
    or not exists (
      select 1
      from public.monthly_task_lock_owner o
      join public.profiles p on p.id = o.user_id and p.status = 'ACTIVE'
      join public.user_roles ur on ur.user_id = p.id and ur.role_id = 1
      where lower(btrim(p.username)) = 'dung0001'
    ) then
    raise exception 'Permission control requires dung0001 as the sole active designated Owner with role ADMIN';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.account_deletion_requests') is not null then
    execute 'drop policy if exists drikapex_account_deletion_requests_read on public.account_deletion_requests';
    execute 'create policy drikapex_account_deletion_requests_read on public.account_deletion_requests for select to authenticated using (public.drikapex_is_owner() or requested_by = auth.uid())';
  end if;
end;
$$;

-- Keep the role catalog stable; MANAGER remains assignable for future hires.
alter table public.roles add column if not exists is_assignable boolean not null default true;

create table if not exists public.drikapex_permission_migrations (
  migration_key text primary key,
  applied_at timestamptz not null default now()
);
alter table public.drikapex_permission_migrations enable row level security;
revoke all on public.drikapex_permission_migrations from public, anon, authenticated;

update public.roles set is_assignable = true
where id in (1, 2, 3)
  and not exists (select 1 from public.drikapex_permission_migrations where migration_key = 'central_permissions_initial');

do $$
begin
  if exists (select 1 from public.drikapex_permission_migrations where migration_key = 'central_permissions_initial') then
    return;
  end if;
  if (select count(*) from public.profiles
      where lower(btrim(username)) in ('phong0002', 'truong0003')
        and status = 'ACTIVE') <> 2 then
    raise exception 'Expected active phong0002 and truong0003 profiles before promotion';
  end if;
  if exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.role_id = 2
      and lower(btrim(p.username)) not in ('phong0002', 'truong0003')
  ) then
    raise exception 'Unexpected members remain in MANAGER; review them before leaving that role empty';
  end if;
end;
$$;

-- Granular capabilities for all application surfaces. Existing codes are kept;
-- these additions let task, report, office and presence RPCs use the same
-- central evaluator instead of maintaining separate role-only authorization.
insert into public.permissions (code, name, description) values
  ('monthly_tasks.view', 'View monthly tasks', 'View tasks allowed by assignment and role scope.'),
  ('monthly_tasks.view_all', 'View all monthly tasks', 'View every task in the workspace.'),
  ('monthly_tasks.create', 'Create monthly tasks', 'Create a task for an authorized team.'),
  ('monthly_tasks.edit', 'Edit monthly tasks', 'Edit an assigned task or tasks within managed scope.'),
  ('monthly_tasks.assign', 'Assign monthly tasks', 'Change task team membership.'),
  ('monthly_tasks.delete', 'Delete monthly tasks', 'Delete tasks within managed scope.'),
  ('monthly_tasks.lock', 'Lock monthly reports', 'Lock or unlock a past report month.'),
  ('monthly_report_notes.view', 'View monthly report notes', 'View monthly difficulties and proposals.'),
  ('monthly_report_notes.view_author', 'View note authors', 'See authors of private monthly difficulties.'),
  ('monthly_report_notes.create', 'Add monthly report notes', 'Add a difficulty or proposal to a monthly report.'),
  ('monthly_report_notes.edit', 'Edit monthly report notes', 'Edit own notes or notes in managed scope.'),
  ('monthly_report_notes.edit_all', 'Manage all monthly report notes', 'Edit or delete notes across the workspace.'),
  ('monthly_report_notes.delete', 'Delete monthly report notes', 'Delete own notes or notes in managed scope.'),
  ('workspace.presence', 'View workspace presence', 'See active employees in the office workspace.'),
  ('office.view', 'View virtual office', 'Read live office state and activity.'),
  ('office.actor_control', 'Control office actor', 'Set an allowed virtual-office status for the current actor.'),
  ('office.scene_effects', 'Trigger office scene effects', 'Use privileged virtual-office scene effects.'),
  ('profile.edit', 'Edit personal profile', 'Update your own display name.'),
  ('menu.accounts.view', 'View Accounts menu', 'Show account management in the control center.'),
  ('menu.permissions.view', 'View Permissions menu', 'Show role and permission governance.'),
  ('menu.audit.view', 'View Activity Log menu', 'Show activity and audit logs.'),
  ('menu.profile.view', 'View Personal Profile menu', 'Show your own profile settings.'),
  ('menu.office.floor.view', 'View Office menu', 'Show the virtual office floor.'),
  ('menu.monthly_report.view', 'View Monthly Report menu', 'Show monthly work reports.'),
  ('menu.people.view', 'View People menu', 'Show the people directory.'),
  ('menu.documents.view', 'View Documents menu', 'Show the documents library.'),
  ('menu.notifications.view', 'View Updates menu', 'Show workspace updates.')
on conflict (code) do update set
  name = excluded.name, description = excluded.description;

-- Sensitive capabilities require owner approval to remove. Destructive actions,
-- account administration and role/audit governance are sensitive.
alter table public.permissions add column if not exists is_sensitive boolean not null default false;
update public.permissions set is_sensitive = (
  code like '%.delete' or code in (
    'users.create', 'users.disable', 'users.edit', 'users.reset_password',
    'roles.manage', 'roles.view', 'audit.view', 'personnel.create',
    'monthly_tasks.assign', 'monthly_tasks.lock', 'monthly_report_notes.view_author',
    'monthly_report_notes.edit_all', 'office.scene_effects'
  )
);

-- Promote the two current managers; keep MANAGER as an assignable, empty tier
-- for future employees without access to the administration dashboard.
insert into public.user_roles (user_id, role_id)
  select p.id, 1 from public.profiles p
  where lower(btrim(p.username)) in ('phong0002', 'truong0003')
    and not exists (select 1 from public.drikapex_permission_migrations where migration_key = 'central_permissions_initial')
  on conflict do nothing;
delete from public.user_roles ur
using public.profiles p
where ur.user_id = p.id and ur.role_id <> 1
  and lower(btrim(p.username)) in ('phong0002', 'truong0003')
  and not exists (select 1 from public.drikapex_permission_migrations where migration_key = 'central_permissions_initial');

-- Administrators hold the complete capability set; the Owner is still
-- distinguished by the designated-owner row and approves sensitive changes.
insert into public.role_permissions (role_id, permission_id)
  select 1, p.id from public.permissions p
  where not exists (select 1 from public.drikapex_permission_migrations where migration_key = 'central_permissions_initial')
  on conflict do nothing;

-- Members may view and contribute to monthly tasks/notes; sensitive management
-- actions remain in the ADMIN defaults. Office actions still obey the
-- per-actor restrictions in office-realtime.sql.
insert into public.role_permissions (role_id, permission_id)
select 3, p.id
from public.permissions p
where not exists (select 1 from public.drikapex_permission_migrations where migration_key = 'central_permissions_initial')
and p.code in (
  'monthly_tasks.view', 'monthly_tasks.create', 'monthly_tasks.edit',
  'monthly_report_notes.view', 'monthly_report_notes.create',
  'monthly_report_notes.edit', 'monthly_report_notes.delete',
  'workspace.presence', 'office.view',
  'office.actor_control', 'profile.edit', 'menu.profile.view',
  'menu.office.floor.view', 'menu.monthly_report.view',
  'menu.people.view', 'menu.documents.view', 'menu.notifications.view'
)
on conflict do nothing;

delete from public.role_permissions rp
where rp.role_id = 2
  and not exists (select 1 from public.drikapex_permission_migrations where migration_key = 'central_permissions_initial')
  and not exists (
    select 1 from public.permissions p
    where p.id = rp.permission_id
      and p.code in (
        'personnel.view', 'documents.view', 'notifications.view',
        'monthly_tasks.view', 'monthly_tasks.create', 'monthly_tasks.edit',
        'monthly_report_notes.view', 'monthly_report_notes.create',
        'monthly_report_notes.edit', 'monthly_report_notes.delete',
        'workspace.presence', 'office.view', 'office.actor_control',
        'profile.edit', 'menu.profile.view', 'menu.office.floor.view',
        'menu.monthly_report.view', 'menu.documents.view', 'menu.notifications.view'
      )
  );
insert into public.role_permissions (role_id, permission_id)
select 2, p.id
from public.permissions p
where not exists (select 1 from public.drikapex_permission_migrations where migration_key = 'central_permissions_initial')
and p.code in (
  'personnel.view', 'documents.view', 'notifications.view',
  'monthly_tasks.view', 'monthly_tasks.create', 'monthly_tasks.edit',
  'monthly_report_notes.view', 'monthly_report_notes.create',
  'monthly_report_notes.edit', 'monthly_report_notes.delete',
  'workspace.presence', 'office.view', 'office.actor_control',
  'profile.edit', 'menu.profile.view', 'menu.office.floor.view',
  'menu.monthly_report.view', 'menu.documents.view', 'menu.notifications.view'
)
on conflict do nothing;

-- Per-user overrides take precedence over the role default.
create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id bigint not null references public.permissions(id) on delete cascade,
  allowed boolean not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_id)
);
alter table public.user_permission_overrides enable row level security;
revoke all on public.user_permission_overrides from public, anon, authenticated;

create table if not exists public.permission_audit_events (
  id bigint generated by default as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_role_id bigint references public.roles(id) on delete set null,
  permission_id bigint references public.permissions(id) on delete set null,
  request_id uuid,
  action text not null,
  previous_allowed boolean,
  requested_allowed boolean,
  details text,
  created_at timestamptz not null default now()
);
create index if not exists permission_audit_events_created_idx
  on public.permission_audit_events (created_at desc);
alter table public.permission_audit_events enable row level security;
revoke all on public.permission_audit_events from public, anon, authenticated;

-- Owner-reviewed approval queue for changes a non-owner admin may not apply
-- directly (editing a same-level admin, or removing a sensitive capability).
create table if not exists public.permission_change_requests (
  id uuid primary key default gen_random_uuid(),
  change_kind text not null check (change_kind in ('user_override', 'role_default', 'user_role')),
  target_user_id uuid references public.profiles(id) on delete cascade,
  target_role_id bigint references public.roles(id) on delete cascade,
  permission_id bigint references public.permissions(id) on delete cascade,
  desired_allowed boolean,
  expected_allowed boolean,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'STALE')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint permission_change_target_shape check (
    (change_kind = 'user_override' and target_user_id is not null and target_role_id is null)
    or (change_kind = 'role_default' and target_role_id is not null and target_user_id is null
        and permission_id is not null and desired_allowed is not null)
    or (change_kind = 'user_role' and target_user_id is not null and target_role_id is not null
        and permission_id is null and desired_allowed is not null)
  )
);
alter table public.permission_change_requests alter column permission_id drop not null;
alter table public.permission_change_requests add column if not exists expected_allowed boolean;
alter table public.permission_change_requests drop constraint if exists permission_change_requests_change_kind_check;
alter table public.permission_change_requests add constraint permission_change_requests_change_kind_check
  check (change_kind in ('user_override', 'role_default', 'user_role'));
alter table public.permission_change_requests drop constraint if exists permission_change_requests_status_check;
alter table public.permission_change_requests add constraint permission_change_requests_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'STALE'));
alter table public.permission_change_requests drop constraint if exists permission_change_target_shape;
alter table public.permission_change_requests add constraint permission_change_target_shape check (
  (change_kind = 'user_override' and target_user_id is not null and target_role_id is null
    and permission_id is not null)
  or (change_kind = 'role_default' and target_role_id is not null and target_user_id is null
    and permission_id is not null and desired_allowed is not null)
  or (change_kind = 'user_role' and target_user_id is not null and target_role_id is not null
    and permission_id is null and desired_allowed is not null)
);
create index if not exists permission_change_requests_pending_idx
  on public.permission_change_requests (status, created_at);
drop index if exists public.permission_change_requests_deduplicate_idx;
create unique index if not exists permission_change_requests_deduplicate_idx
  on public.permission_change_requests
    (change_kind, coalesce(target_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(target_role_id, -1), coalesce(permission_id, -1), requested_by)
  where status = 'PENDING';
alter table public.permission_change_requests enable row level security;
revoke all on public.permission_change_requests from public, anon, authenticated;
grant select on public.permission_change_requests to authenticated;

drop policy if exists drikapex_permission_requests_read on public.permission_change_requests;
create policy drikapex_permission_requests_read on public.permission_change_requests
  for select to authenticated
  using (
    public.drikapex_is_owner()
    or requested_by = auth.uid()
  );

drop policy if exists drikapex_permission_audit_read on public.permission_audit_events;
create policy drikapex_permission_audit_read on public.permission_audit_events
  for select to authenticated using (public.drikapex_is_owner());
grant select on public.permission_audit_events to authenticated;

create or replace function public.drikapex_can_manage_user(target_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    target_user_id <> auth.uid()
    and not public.drikapex_is_owner_user(target_user_id)
    and (
      public.drikapex_is_owner()
      or (
        public.drikapex_actor_level() = 1
        and not exists (
          select 1 from public.user_roles target_role
          where target_role.user_id = target_user_id and target_role.role_id <= 1
        )
      )
    ),
    false
  );
$$;

create or replace function public.drikapex_can_manage_role(target_role_id bigint)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    exists (select 1 from public.roles where id = target_role_id and is_assignable)
    and (public.drikapex_is_owner() or (public.drikapex_actor_level() = 1 and target_role_id > 1)),
    false
  );
$$;

-- A custom policy cannot override revoked table/column grants. All supported
-- changes now go through the checked, audited RPCs below.
do $$
declare table_name text; column_name text; operation text;
begin
  foreach table_name in array array['roles', 'permissions', 'user_roles', 'role_permissions'] loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from public, anon, authenticated',
      table_name
    );
    for column_name in
      select a.attname from pg_attribute a
      where a.attrelid = format('public.%I', table_name)::regclass
        and a.attnum > 0 and not a.attisdropped
    loop
      foreach operation in array array['insert', 'update', 'references'] loop
        execute format(
          'revoke %s (%I) on public.%I from public, anon, authenticated',
          operation, column_name, table_name
        );
      end loop;
    end loop;
  end loop;
end $$;
drop policy if exists drikapex_user_roles_insert on public.user_roles;
drop policy if exists drikapex_user_roles_delete on public.user_roles;
drop policy if exists drikapex_user_roles_manage on public.user_roles;
drop policy if exists drikapex_role_permissions_manage on public.role_permissions;

-- Shared evaluator for authenticated RLS and trusted Edge Functions.
create or replace function public.drikapex_user_has_permission(
  p_user_id uuid,
  required_code text
)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    exists (select 1 from public.profiles where id = p_user_id and status = 'ACTIVE')
    and (
      public.drikapex_is_owner_user(p_user_id)
      or coalesce((
      select coalesce(o.allowed, exists (
        select 1 from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        where ur.user_id = p_user_id and rp.permission_id = p.id
      ))
      from public.permissions p
      left join public.user_permission_overrides o
        on o.user_id = p_user_id and o.permission_id = p.id
      where p.code = required_code
      ), false)
    ),
    false
  );
$$;
revoke all on function public.drikapex_user_has_permission(uuid, text) from public, anon, authenticated;
grant execute on function public.drikapex_user_has_permission(uuid, text) to service_role;

-- Complete a newly created Auth account atomically. Only the trusted Edge
-- Function may call this, and it rechecks the actor's current access.
create unique index if not exists profiles_username_normalized_unique
  on public.profiles (lower(btrim(username))) where username is not null;

create or replace function public.drikapex_provision_account(
  p_actor uuid, p_user uuid, p_username text, p_display_name text, p_role_id bigint
)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare normalized_username text := lower(btrim(p_username));
begin
  if not public.drikapex_user_has_permission(p_actor, 'users.create')
    or not (public.drikapex_is_owner_user(p_actor) or exists (
      select 1 from public.user_roles where user_id = p_actor and role_id = 1
    )) then
    raise exception 'Not authorized to create accounts' using errcode = '42501';
  end if;
  if normalized_username is null or normalized_username !~ '^[a-z0-9._-]{3,64}$'
    or p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then
    raise exception 'Invalid profile details' using errcode = '22023';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and is_assignable)
    or (p_role_id <= 1 and not public.drikapex_is_owner_user(p_actor)) then
    raise exception 'Not authorized to assign this role' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Auth account not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('drikapex_username'), hashtext(normalized_username));
  if exists (select 1 from public.profiles where lower(btrim(username)) = normalized_username) then
    raise exception 'Username already exists' using errcode = '23505';
  end if;
  insert into public.profiles (id, username, display_name, status)
  values (p_user, normalized_username, btrim(p_display_name), 'ACTIVE');
  insert into public.user_roles (user_id, role_id) values (p_user, p_role_id);
  insert into public.audit_logs (user_id, action, module, target_type, target_id, description)
  values (p_actor, 'CREATE_ACCOUNT', 'ADMINISTRATION', 'AUTH_USER', p_user::text,
    format('Created account %s with role %s.', normalized_username, p_role_id));
end $$;
revoke all on function public.drikapex_provision_account(uuid, uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.drikapex_provision_account(uuid, uuid, text, text, bigint)
  to service_role;

-- Single source of truth. Owner is always allowed; otherwise an active profile
-- resolves its per-user override first, then the role default.
create or replace function public.drikapex_has_permission(required_code text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select public.drikapex_user_has_permission(auth.uid(), required_code); $$;
revoke all on function public.drikapex_has_permission(text) from public, anon;
grant execute on function public.drikapex_has_permission(text) to authenticated;

drop policy if exists drikapex_profiles_update on public.profiles;
create policy drikapex_profiles_update on public.profiles
  for update to authenticated
  using (
    (public.drikapex_can_manage_user(id) and public.drikapex_has_permission('users.edit'))
    or (id = auth.uid() and public.drikapex_has_permission('profile.edit'))
  )
  with check (
    (public.drikapex_can_manage_user(id) and public.drikapex_has_permission('users.edit'))
    or (id = auth.uid() and public.drikapex_has_permission('profile.edit'))
  );

drop policy if exists drikapex_employees_read on public.employees;
create policy drikapex_employees_read on public.employees
  for select to authenticated
  using (
    public.drikapex_has_permission('personnel.view')
    or exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid() and profile.employee_id = employees.id
    )
  );

create or replace function public.drikapex_profile_update_guard()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() = old.id then
    if new.employee_id is distinct from old.employee_id
      or new.username is distinct from old.username
      or new.status is distinct from old.status then
      raise exception 'Personal profile editing cannot change employee link, username, or account status'
        using errcode = '42501';
    end if;
    if new.display_name is null or length(btrim(new.display_name)) not between 1 and 80 then
      raise exception 'Display name must contain 1 to 80 characters' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists drikapex_profile_update_guard on public.profiles;
create trigger drikapex_profile_update_guard
before update on public.profiles
for each row execute function public.drikapex_profile_update_guard();

-- Who may administer capabilities: an active administrator (level 1) or owner.
create or replace function public.drikapex_can_admin_permissions()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select public.drikapex_is_owner()
    or (coalesce(public.drikapex_actor_level() = 1, false)
      and public.drikapex_has_permission('roles.manage'));
$$;
revoke all on function public.drikapex_can_admin_permissions() from public, anon;
grant execute on function public.drikapex_can_admin_permissions() to authenticated;

-- Effective capabilities for a target account, with the resolved source.
create or replace function public.drikapex_effective_permissions(p_user_id uuid default null)
returns table(permission_id bigint, code text, name text, description text,
              is_sensitive boolean, allowed boolean, role_allowed boolean,
              override_allowed boolean, target_is_owner boolean, source text)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare target uuid := coalesce(p_user_id, auth.uid());
begin
  if not public.drikapex_can_admin_permissions() and target <> auth.uid() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'Unknown account' using errcode = 'P0002';
  end if;
  return query
  select p.id, p.code::text, p.name::text, p.description::text, p.is_sensitive,
    case when public.drikapex_is_owner_user(target) then true
         when profile.status <> 'ACTIVE' then false
         else coalesce(o.allowed, r.role_allowed) end,
    r.role_allowed, o.allowed, public.drikapex_is_owner_user(target),
    case when public.drikapex_is_owner_user(target) then 'owner'
         when profile.status <> 'ACTIVE' then 'inactive'
         when o.user_id is not null then 'override'
         when r.role_allowed then 'role' else 'none' end
  from public.permissions p
  join public.profiles profile on profile.id = target
  left join public.user_permission_overrides o on o.user_id = target and o.permission_id = p.id
  cross join lateral (select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = target and rp.permission_id = p.id
  ) as role_allowed) r
  order by p.code;
end $$;
revoke all on function public.drikapex_effective_permissions(uuid) from public, anon;
grant execute on function public.drikapex_effective_permissions(uuid) to authenticated;

create or replace function public.drikapex_permission_catalog()
returns table(id bigint, code text, name text, description text, is_sensitive boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.drikapex_can_admin_permissions()
    and not public.drikapex_has_permission('roles.view') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select p.id, p.code::text, p.name::text, p.description::text, p.is_sensitive
  from public.permissions p
  order by p.code;
end $$;
revoke all on function public.drikapex_permission_catalog() from public, anon;
grant execute on function public.drikapex_permission_catalog() to authenticated;

-- Capability defaults for a role.
create or replace function public.drikapex_role_permissions(p_role_id bigint)
returns table(permission_id bigint, code text, name text, description text,
              is_sensitive boolean, allowed boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.drikapex_can_admin_permissions() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select p.id, p.code::text, p.name::text, p.description::text, p.is_sensitive,
    exists (select 1 from public.role_permissions rp
            where rp.role_id = p_role_id and rp.permission_id = p.id)
  from public.permissions p order by p.code;
end $$;
revoke all on function public.drikapex_role_permissions(bigint) from public, anon;
grant execute on function public.drikapex_role_permissions(bigint) to authenticated;

-- Accounts belonging to a role, for the control center roster.
create or replace function public.drikapex_role_members(p_role_id bigint)
returns table(user_id uuid, display_name text, username text, status text, is_owner boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.drikapex_can_admin_permissions() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select pr.id, pr.display_name::text, pr.username::text, pr.status::text,
    public.drikapex_is_owner_user(pr.id)
  from public.profiles pr
  join public.user_roles ur on ur.user_id = pr.id
  where ur.role_id = p_role_id
  order by public.drikapex_is_owner_user(pr.id) desc, coalesce(pr.display_name, pr.username);
end $$;
revoke all on function public.drikapex_role_members(bigint) from public, anon;
grant execute on function public.drikapex_role_members(bigint) to authenticated;

-- Shared authorization + serialization for every capability mutation.
create or replace function public.drikapex_guard_permission_mutation()
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Permission mutations require READ COMMITTED isolation';
  end if;
  if not public.drikapex_can_admin_permissions() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(1743298741, 20261120);
end $$;
revoke all on function public.drikapex_guard_permission_mutation() from public, anon, authenticated;

create or replace function public.drikapex_apply_user_override(
  p_user_id uuid, p_permission_id bigint, p_allowed boolean, p_actor uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if p_allowed is null then
    delete from public.user_permission_overrides
    where user_id = p_user_id and permission_id = p_permission_id;
  else
    insert into public.user_permission_overrides(user_id, permission_id, allowed, updated_by, updated_at)
    values (p_user_id, p_permission_id, p_allowed, p_actor, now())
    on conflict (user_id, permission_id)
    do update set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;
revoke all on function public.drikapex_apply_user_override(uuid, bigint, boolean, uuid) from public, anon, authenticated;

create or replace function public.drikapex_apply_role_default(
  p_role_id bigint, p_permission_id bigint, p_allowed boolean)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if p_allowed then
    insert into public.role_permissions(role_id, permission_id)
    values (p_role_id, p_permission_id) on conflict do nothing;
  else
    delete from public.role_permissions where role_id = p_role_id and permission_id = p_permission_id;
  end if;
end $$;
revoke all on function public.drikapex_apply_role_default(bigint, bigint, boolean) from public, anon, authenticated;

-- Set a per-user override. Applies directly, or queues owner approval when a
-- non-owner admin edits a same-level administrator or removes a sensitive
-- capability. Returns 'applied' or 'queued'.
create or replace function public.drikapex_set_user_permission(
  p_user_id uuid, p_permission_id bigint, p_allowed boolean, p_reason text default null)
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  is_owner boolean;
  target_level bigint;
  perm record;
  currently_effective boolean;
  removes_capability boolean;
  needs_approval boolean;
begin
  perform public.drikapex_guard_permission_mutation();
  is_owner := public.drikapex_is_owner();
  if p_user_id is null or p_user_id = actor then
    raise exception 'Choose another account' using errcode = '22023';
  end if;
  if public.drikapex_is_owner_user(p_user_id) then
    raise exception 'The owner already holds every capability' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Unknown account' using errcode = 'P0002';
  end if;
  select p.id, p.code, p.is_sensitive into perm from public.permissions p where p.id = p_permission_id;
  if not found then raise exception 'Unknown permission' using errcode = 'P0002'; end if;

  select min(role_id) into target_level from public.user_roles where user_id = p_user_id;

  select coalesce(o.allowed, exists (
    select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_user_id and rp.permission_id = p_permission_id)) into currently_effective
  from public.permissions p
  left join public.user_permission_overrides o on o.user_id = p_user_id and o.permission_id = p.id
  where p.id = p_permission_id;

  removes_capability := currently_effective and coalesce(p_allowed, exists (
    select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_user_id and rp.permission_id = p_permission_id)) = false;

  if is_owner then
    needs_approval := false;
  else
    -- A non-owner admin may freely manage strictly-lower roles for non-sensitive
    -- grants; same-level targets and sensitive removals require owner approval.
    needs_approval := coalesce(target_level, 999) <= 1
      or (perm.is_sensitive and removes_capability);
  end if;

  if needs_approval then
    if nullif(btrim(p_reason), '') is null then
      raise exception 'A reason is required for changes that need Owner approval' using errcode = '22023';
    end if;
    insert into public.permission_change_requests(
      change_kind, target_user_id, permission_id, desired_allowed, expected_allowed, requested_by, reason)
    values ('user_override', p_user_id, p_permission_id, p_allowed,
      currently_effective, actor, btrim(p_reason));
    return 'queued';
  end if;

  perform public.drikapex_apply_user_override(p_user_id, p_permission_id, p_allowed, actor);
  insert into public.permission_audit_events(
    actor_id, target_user_id, permission_id, action, previous_allowed, requested_allowed)
  values (actor, p_user_id, p_permission_id, 'USER_OVERRIDE_APPLIED',
    currently_effective, coalesce(p_allowed, perm.code is not null and exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = p_user_id and rp.permission_id = p_permission_id
    )));
  return 'applied';
end $$;
revoke all on function public.drikapex_set_user_permission(uuid, bigint, boolean, text) from public, anon;
grant execute on function public.drikapex_set_user_permission(uuid, bigint, boolean, text) to authenticated;

-- Change a role default. Owner applies directly; a non-owner admin always
-- queues owner approval because role defaults affect every member.
create or replace function public.drikapex_set_role_permission(
  p_role_id bigint, p_permission_id bigint, p_allowed boolean, p_reason text default null)
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare actor uuid := auth.uid();
  previous_allowed boolean;
begin
  perform public.drikapex_guard_permission_mutation();
  if p_allowed is null then raise exception 'A role default must be allowed or denied' using errcode = '22023'; end if;
  if not exists (select 1 from public.roles where id = p_role_id and is_assignable) then
    raise exception 'Unknown or non-assignable role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.permissions where id = p_permission_id) then
    raise exception 'Unknown permission' using errcode = 'P0002';
  end if;
  select exists (select 1 from public.role_permissions
    where role_id = p_role_id and permission_id = p_permission_id)
    into previous_allowed;
  if public.drikapex_is_owner() then
    perform public.drikapex_apply_role_default(p_role_id, p_permission_id, p_allowed);
    insert into public.permission_audit_events(
      actor_id, target_role_id, permission_id, action, previous_allowed, requested_allowed)
    values (actor, p_role_id, p_permission_id, 'ROLE_DEFAULT_APPLIED', previous_allowed, p_allowed);
    return 'applied';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required for Owner review' using errcode = '22023';
  end if;
  insert into public.permission_change_requests(
    change_kind, target_role_id, permission_id, desired_allowed, expected_allowed, requested_by, reason)
  values ('role_default', p_role_id, p_permission_id, p_allowed, previous_allowed, actor, btrim(p_reason));
  return 'queued';
end $$;
revoke all on function public.drikapex_set_role_permission(bigint, bigint, boolean, text) from public, anon;
grant execute on function public.drikapex_set_role_permission(bigint, bigint, boolean, text) to authenticated;

create or replace function public.drikapex_set_user_role(
  p_user_id uuid, p_role_id bigint, p_assigned boolean, p_reason text default null)
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  already_assigned boolean;
begin
  perform public.drikapex_guard_permission_mutation();
  if p_user_id is null or p_user_id = actor or p_assigned is null then
    raise exception 'Choose another account and a valid role action' using errcode = '22023';
  end if;
  if public.drikapex_is_owner_user(p_user_id) then
    raise exception 'The designated Owner role cannot be changed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id)
    or not exists (select 1 from public.roles where id = p_role_id and is_assignable) then
    raise exception 'Unknown account or non-assignable role' using errcode = 'P0002';
  end if;
  if not public.drikapex_is_owner() and not public.drikapex_can_manage_user(p_user_id) then
    raise exception 'You can manage only member accounts' using errcode = '42501';
  end if;
  select exists (select 1 from public.user_roles where user_id = p_user_id and role_id = p_role_id)
    into already_assigned;
  if already_assigned = p_assigned then return 'unchanged'; end if;

  if public.drikapex_is_owner() then
    if p_assigned then
      insert into public.user_roles(user_id, role_id) values (p_user_id, p_role_id);
    else
      delete from public.user_roles where user_id = p_user_id and role_id = p_role_id;
    end if;
    insert into public.permission_audit_events(
      actor_id, target_user_id, target_role_id, action, previous_allowed, requested_allowed)
    values (actor, p_user_id, p_role_id, 'USER_ROLE_APPLIED', already_assigned, p_assigned);
    return 'applied';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required for Owner review of role changes' using errcode = '22023';
  end if;
  insert into public.permission_change_requests(
    change_kind, target_user_id, target_role_id, desired_allowed, expected_allowed, requested_by, reason)
  values ('user_role', p_user_id, p_role_id, p_assigned, already_assigned, actor, btrim(p_reason));
  return 'queued';
end $$;
revoke all on function public.drikapex_set_user_role(uuid, bigint, boolean, text) from public, anon;
grant execute on function public.drikapex_set_user_role(uuid, bigint, boolean, text) to authenticated;

-- Owner reviews a queued change. Approving applies the stored change.
create or replace function public.drikapex_review_permission_change(p_id uuid, p_approve boolean)
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  req public.permission_change_requests%rowtype;
  current_allowed boolean;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Permission mutations require READ COMMITTED isolation';
  end if;
  if not public.drikapex_is_owner() then
    raise exception 'Only the owner can review permission changes' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(1743298741, 20261120);
  select * into req from public.permission_change_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if req.status <> 'PENDING' then raise exception 'Request already decided' using errcode = '40001'; end if;

  if p_approve then
    if req.change_kind = 'user_override' then
      select coalesce(o.allowed, exists (
        select 1 from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        where ur.user_id = req.target_user_id and rp.permission_id = req.permission_id
      )) into current_allowed
      from public.user_permission_overrides o
      where o.user_id = req.target_user_id and o.permission_id = req.permission_id;
      if not found then
        select exists (
          select 1 from public.user_roles ur
          join public.role_permissions rp on rp.role_id = ur.role_id
          where ur.user_id = req.target_user_id and rp.permission_id = req.permission_id
        ) into current_allowed;
      end if;
    elsif req.change_kind = 'role_default' then
      select exists (select 1 from public.role_permissions
        where role_id = req.target_role_id and permission_id = req.permission_id)
        into current_allowed;
    else
      select exists (select 1 from public.user_roles
        where user_id = req.target_user_id and role_id = req.target_role_id)
        into current_allowed;
    end if;

    if current_allowed is distinct from req.expected_allowed
      or (req.change_kind = 'user_override' and public.drikapex_is_owner_user(req.target_user_id))
      or (req.change_kind = 'role_default' and not exists (
        select 1 from public.roles where id = req.target_role_id and is_assignable
      ))
      or (req.change_kind = 'user_role' and (
        public.drikapex_is_owner_user(req.target_user_id)
        or not exists (select 1 from public.roles where id = req.target_role_id and is_assignable)
      )) then
      update public.permission_change_requests
      set status = 'STALE', decided_by = auth.uid(), decided_at = now()
      where id = p_id;
      insert into public.permission_audit_events(
        actor_id, target_user_id, target_role_id, permission_id, request_id,
        action, previous_allowed, requested_allowed, details)
      values (auth.uid(), req.target_user_id, req.target_role_id, req.permission_id, req.id,
        'REQUEST_STALE', req.expected_allowed, req.desired_allowed,
        'The target or current permission state changed before Owner review.');
      return 'stale';
    end if;

    if req.change_kind = 'user_override' then
      perform public.drikapex_apply_user_override(
        req.target_user_id, req.permission_id, req.desired_allowed, req.requested_by);
    elsif req.change_kind = 'role_default' then
      perform public.drikapex_apply_role_default(req.target_role_id, req.permission_id, req.desired_allowed);
    elsif req.change_kind = 'user_role' and req.desired_allowed then
      insert into public.user_roles(user_id, role_id) values (req.target_user_id, req.target_role_id);
    elsif req.change_kind = 'user_role' then
      delete from public.user_roles where user_id = req.target_user_id and role_id = req.target_role_id;
    end if;
  end if;

  update public.permission_change_requests
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
      decided_by = auth.uid(), decided_at = now()
  where id = p_id;
  insert into public.permission_audit_events(
    actor_id, target_user_id, target_role_id, permission_id, request_id,
    action, previous_allowed, requested_allowed, details)
  values (auth.uid(), req.target_user_id, req.target_role_id, req.permission_id, req.id,
    case when p_approve then 'REQUEST_APPROVED' else 'REQUEST_REJECTED' end,
    req.expected_allowed, req.desired_allowed,
    format('Requested by %s. %s', req.requested_by, coalesce(req.reason, '')));
  return case when p_approve then 'approved' else 'rejected' end;
end $$;
revoke all on function public.drikapex_review_permission_change(uuid, boolean) from public, anon;
grant execute on function public.drikapex_review_permission_change(uuid, boolean) to authenticated;

-- Pending/decided change requests for the control center.
drop function if exists public.drikapex_list_permission_changes(boolean);
create or replace function public.drikapex_list_permission_changes(p_include_decided boolean default false)
returns table(id uuid, change_kind text, permission_code text, permission_name text,
              target_user_id uuid, target_name text, target_role_id bigint, target_role_name text,
              desired_allowed boolean,
              requested_by_name text, reason text, status text, created_at timestamptz)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.drikapex_can_admin_permissions() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select r.id, r.change_kind,
    coalesce(p.code::text, 'roles.assignment'),
    coalesce(p.name::text, 'Role assignment'),
    r.target_user_id, coalesce(tp.display_name, tp.username)::text,
    r.target_role_id, tr.name::text, r.desired_allowed,
    coalesce(rp.display_name, rp.username)::text, r.reason, r.status, r.created_at
  from public.permission_change_requests r
  left join public.permissions p on p.id = r.permission_id
  left join public.profiles tp on tp.id = r.target_user_id
  left join public.profiles rp on rp.id = r.requested_by
  left join public.roles tr on tr.id = r.target_role_id
  where (p_include_decided or r.status = 'PENDING')
    and (public.drikapex_is_owner() or r.requested_by = auth.uid())
  order by r.created_at desc;
end $$;
revoke all on function public.drikapex_list_permission_changes(boolean) from public, anon;
grant execute on function public.drikapex_list_permission_changes(boolean) to authenticated;

create or replace function public.drikapex_permission_audit_events(p_limit integer default 100)
returns table(id bigint, actor_name text, target_name text, role_name text,
              permission_code text, action text, previous_allowed boolean,
              requested_allowed boolean, details text, created_at timestamptz)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.drikapex_is_owner() then
    raise exception 'Only the Owner can view permission audit events' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Audit limit must be between 1 and 500' using errcode = '22023';
  end if;
  return query
  select e.id,
    coalesce(actor.display_name, actor.username)::text,
    coalesce(target.display_name, target.username)::text,
    role.name::text, permission.code::text, e.action,
    e.previous_allowed, e.requested_allowed, e.details, e.created_at
  from public.permission_audit_events e
  left join public.profiles actor on actor.id = e.actor_id
  left join public.profiles target on target.id = e.target_user_id
  left join public.roles role on role.id = e.target_role_id
  left join public.permissions permission on permission.id = e.permission_id
  order by e.created_at desc
  limit p_limit;
end $$;
revoke all on function public.drikapex_permission_audit_events(integer) from public, anon;
grant execute on function public.drikapex_permission_audit_events(integer) to authenticated;

-- Enforcement map: where each capability is checked across RLS policies and
-- SECURITY DEFINER routines, plus the Edge Functions that gate on roles. This
-- gives the owner one supervision view over the whole authorization surface.
create or replace function public.drikapex_permission_enforcement()
returns table(code text, name text, is_sensitive boolean,
              rls_policies text[], routines text[], edge_functions text[])
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.drikapex_is_owner() then
    raise exception 'Only the Owner can view the enforcement map' using errcode = '42501';
  end if;
  return query
  with pol as (
    select p.code,
      array_agg(distinct (pl.tablename || '.' || pl.policyname) order by (pl.tablename || '.' || pl.policyname)) as policies
    from public.permissions p
    join pg_policies pl on pl.schemaname = 'public'
      and (coalesce(pl.qual, '') like '%' || p.code || '%' or coalesce(pl.with_check, '') like '%' || p.code || '%')
    group by p.code
  ),
  rout as (
    select p.code,
      array_agg(distinct pr.proname order by pr.proname) as routines
    from public.permissions p
    join pg_proc pr on pr.pronamespace = 'public'::regnamespace
      and pr.prokind = 'f'
      and pg_get_functiondef(pr.oid) like '%' || p.code || '%'
    group by p.code
  ),
  edge(code, fns) as (
    values
      ('users.reset_password', array['password-recovery (Owner-only)']),
      ('personnel.delete', array['account-deletion-workflow', 'delete-account'])
  )
  select p.code::text, p.name::text, p.is_sensitive,
    coalesce(pol.policies, '{}'), coalesce(rout.routines, '{}'), coalesce(edge.fns, '{}')
  from public.permissions p
  left join pol on pol.code = p.code
  left join rout on rout.code = p.code
  left join edge on edge.code = p.code
  order by p.code;
end $$;
revoke all on function public.drikapex_permission_enforcement() from public, anon;
grant execute on function public.drikapex_permission_enforcement() to authenticated;

insert into public.drikapex_permission_migrations (migration_key)
values ('central_permissions_initial')
on conflict do nothing;

commit;

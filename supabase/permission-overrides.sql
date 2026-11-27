-- REVIEW BEFORE APPLYING, after rls-policies.sql. This does not seed permissions,
-- modify accounts, or update existing assignments. Apply as a privileged owner.
--
-- The original dashboard writes user_roles/role_permissions directly and reads
-- role unions, not effective permissions. Those writes will be rejected until
-- the dashboard is migrated to the RPCs below. Do not re-run rls-policies.sql
-- or bootstrap-accounts.sql afterwards: they restore grants/change defaults.
--
-- This covers only policies calling drikapex_has_permission. Monthly tasks,
-- office/realtime, profile management and service-role Edge Functions use
-- separate role/status checks and are NOT controlled by these overrides.
-- Inspect the deployed schema, grants, other policies, SECURITY DEFINER
-- functions, service clients and role memberships before applying. The policy
-- name preflight below does not verify policy expressions or role membership.
begin;

-- Unknown policies can OR with the known policies and bypass a deny.
do $$
declare
  item record;
  allowed text[];
begin
  for item in
    select * from (values
      ('employees', array['drikapex_employees_read','drikapex_employees_create','drikapex_employees_edit','drikapex_employees_delete']),
      ('profiles', array['drikapex_profiles_read','drikapex_profiles_update']),
      ('roles', array['drikapex_roles_read']),
      ('permissions', array['drikapex_permissions_read']),
      ('user_roles', array['drikapex_user_roles_read','drikapex_user_roles_insert','drikapex_user_roles_delete']),
      ('role_permissions', array['drikapex_role_permissions_read','drikapex_role_permissions_manage']),
      ('document_categories', array['drikapex_categories_read']),
      ('documents', array['drikapex_documents_read','drikapex_documents_create','drikapex_documents_edit','drikapex_documents_delete']),
      ('notifications', array['drikapex_notifications_read','drikapex_notifications_create','drikapex_notifications_edit','drikapex_notifications_delete']),
      ('notification_reads', array['drikapex_notification_reads_select','drikapex_notification_reads_insert','drikapex_notification_reads_update']),
      ('audit_logs', array['drikapex_audit_logs_read'])
    ) as expected(table_name, policy_names)
  loop
    allowed := item.policy_names;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = item.table_name and c.relrowsecurity
    ) then
      raise exception 'Missing table or RLS disabled: public.%', item.table_name;
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = item.table_name
        and not (policyname = any(allowed))
    ) then
      raise exception 'Unexpected policy on public.%: review it before migration', item.table_name;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public'
        and tablename = item.table_name and policyname = any(allowed)) <> cardinality(allowed) then
      raise exception 'Expected policies missing on public.%: review schema before migration', item.table_name;
    end if;
  end loop;
  if not exists (select 1 from public.roles where id = 1 and code = 'ADMIN')
     or not exists (select 1 from public.roles where id = 2 and code = 'MANAGER') then
    raise exception 'Expected ADMIN=1 and MANAGER=2 hierarchy not found';
  end if;
end $$;

create table public.user_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id bigint not null references public.permissions(id) on delete cascade,
  allowed boolean not null,
  primary key (user_id, permission_id)
);
alter table public.user_permission_overrides enable row level security;
revoke all on public.user_permission_overrides from public, anon, authenticated;
do $$
begin
  if has_table_privilege('authenticated', 'public.user_permission_overrides', 'INSERT,UPDATE,DELETE,TRUNCATE')
     or has_any_column_privilege('authenticated', 'public.user_permission_overrides', 'INSERT,UPDATE')
     or has_table_privilege('anon', 'public.user_permission_overrides', 'INSERT,UPDATE,DELETE,TRUNCATE')
     or has_any_column_privilege('anon', 'public.user_permission_overrides', 'INSERT,UPDATE') then
    raise exception 'Inherited override write grants must be removed before migration';
  end if;
end $$;

-- All supported authorization mutations serialize, including profile status
-- updates and privileged maintenance. RPCs require READ COMMITTED so the
-- authorization checks after acquiring the lock see the latest committed data.
create function public.drikapex_permission_lock()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Permission mutations require READ COMMITTED isolation';
  end if;
  perform pg_advisory_xact_lock(1743298741, 20261119);
  return null;
end $$;
revoke all on function public.drikapex_permission_lock() from public, anon, authenticated;

create trigger drikapex_permissions_lock before insert or update or delete
  on public.permissions for each statement execute function public.drikapex_permission_lock();
create trigger drikapex_roles_lock before insert or update or delete
  on public.roles for each statement execute function public.drikapex_permission_lock();
create trigger drikapex_user_roles_lock before insert or update or delete
  on public.user_roles for each statement execute function public.drikapex_permission_lock();
create trigger drikapex_role_permissions_lock before insert or update or delete
  on public.role_permissions for each statement execute function public.drikapex_permission_lock();
create trigger drikapex_overrides_lock before insert or update or delete
  on public.user_permission_overrides for each statement execute function public.drikapex_permission_lock();
create trigger drikapex_profiles_lock before insert or update or delete
  on public.profiles for each statement execute function public.drikapex_permission_lock();

-- A manager may not reactivate an account with latent rights they lack.
-- Reactivation remains available to ADMIN; other status changes are unchanged.
create function public.drikapex_guard_profile_activation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'ACTIVE' and old.status is distinct from new.status
     and public.drikapex_actor_level() = 2 then
    raise exception 'Manager account reactivation is unsupported; ask an ADMIN';
  end if;
  return new;
end $$;
revoke all on function public.drikapex_guard_profile_activation() from public, anon, authenticated;
create trigger drikapex_profile_activation_guard before update of status
  on public.profiles for each row execute function public.drikapex_guard_profile_activation();

-- Direct writes are forbidden even if another permissive policy exists. Remove
-- column grants too. Role/permission definition edits are not supported.
do $$
declare t text; c record; operation text;
begin
  foreach t in array array['roles','permissions','user_roles','role_permissions'] loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from public, anon, authenticated', t);
    for c in select attname from pg_attribute
      where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped
    loop
      foreach operation in array array['insert','update','references'] loop
        execute format('revoke %s (%I) on public.%I from public, anon, authenticated', operation, c.attname, t);
      end loop;
    end loop;
    if has_table_privilege('authenticated', format('public.%I', t), 'INSERT,UPDATE,DELETE,TRUNCATE')
       or has_any_column_privilege('authenticated', format('public.%I', t), 'INSERT,UPDATE')
       or has_table_privilege('anon', format('public.%I', t), 'INSERT,UPDATE,DELETE,TRUNCATE')
       or has_any_column_privilege('anon', format('public.%I', t), 'INSERT,UPDATE') then
      raise exception 'Inherited write grants on public.% must be removed before migration', t;
    end if;
  end loop;
end $$;
drop policy drikapex_user_roles_insert on public.user_roles;
drop policy drikapex_user_roles_delete on public.user_roles;
drop policy drikapex_role_permissions_manage on public.role_permissions;

create or replace function public.drikapex_has_permission(required_code text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select coalesce(o.allowed, exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = auth.uid() and rp.permission_id = p.id
    ))
    from public.permissions p
    left join public.user_permission_overrides o
      on o.user_id = auth.uid() and o.permission_id = p.id
    where p.code = required_code
      and exists (select 1 from public.profiles where id = auth.uid() and status = 'ACTIVE')
  ), false);
$$;
revoke all on function public.drikapex_has_permission(text) from public, anon;
grant execute on function public.drikapex_has_permission(text) to authenticated;

-- Internal target check: unassigned profiles count as lower; no self/equal/
-- higher administration. Role ids are the existing hierarchy.
create function public.drikapex_permission_target_ok(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(auth.uid() is not null and p_user_id <> auth.uid()
    and public.drikapex_actor_level() in (1, 2)
    and exists (select 1 from public.profiles where id = p_user_id)
    and not exists (
      select 1 from public.user_roles ur where ur.user_id = p_user_id
        and ur.role_id <= public.drikapex_actor_level()
    ), false);
$$;
revoke all on function public.drikapex_permission_target_ok(uuid) from public, anon, authenticated;

create function public.drikapex_effective_permissions(p_user_id uuid default null)
returns table(permission_id bigint, code text, allowed boolean, source text,
              role_allowed boolean, override_allowed boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare target uuid := coalesce(p_user_id, auth.uid());
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and status = 'ACTIVE'
  ) or (target <> auth.uid() and not public.drikapex_permission_target_ok(target)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select p.id, p.code::text,
      case when profile.status <> 'ACTIVE' then false
           else coalesce(o.allowed, r.has_role_permission) end,
      case when profile.status <> 'ACTIVE' then 'inactive'
           when o.user_id is not null then 'override'
           when r.has_role_permission then 'role' else 'none' end,
      r.has_role_permission, o.allowed
    from public.permissions p
    join public.profiles profile on profile.id = target
    left join public.user_permission_overrides o
      on o.user_id = target and o.permission_id = p.id
    cross join lateral (select exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = target and rp.permission_id = p.id
    ) as has_role_permission) r
    order by p.code;
end $$;
revoke all on function public.drikapex_effective_permissions(uuid) from public, anon;
grant execute on function public.drikapex_effective_permissions(uuid) to authenticated;

create function public.drikapex_set_user_permission(p_user_id uuid, p_permission_id bigint, p_allowed boolean)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare permission_code text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Permission mutations require READ COMMITTED isolation';
  end if;
  perform pg_advisory_xact_lock(1743298741, 20261119);
  if not public.drikapex_permission_target_ok(p_user_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select p.code into permission_code from public.permissions p where p.id = p_permission_id;
  if not found then raise exception 'Unknown permission'; end if;
  if public.drikapex_actor_level() = 2 and not public.drikapex_has_permission(permission_code)
    and (p_allowed is true or (p_allowed is null and exists (
      select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = p_user_id and rp.permission_id = p_permission_id
    ))) then
    raise exception 'Manager cannot grant a permission they lack' using errcode = '42501';
  end if;
  if p_allowed is null then
    delete from public.user_permission_overrides where user_id = p_user_id and permission_id = p_permission_id;
  else
    insert into public.user_permission_overrides(user_id, permission_id, allowed)
    values (p_user_id, p_permission_id, p_allowed)
    on conflict (user_id, permission_id) do update set allowed = excluded.allowed;
  end if;
end $$;
revoke all on function public.drikapex_set_user_permission(uuid, bigint, boolean) from public, anon;
grant execute on function public.drikapex_set_user_permission(uuid, bigint, boolean) to authenticated;

create function public.drikapex_set_role_permission(p_role_id bigint, p_permission_id bigint, p_allowed boolean)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare actor_level bigint; permission_code text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Permission mutations require READ COMMITTED isolation';
  end if;
  perform pg_advisory_xact_lock(1743298741, 20261119);
  actor_level := public.drikapex_actor_level();
  if actor_level is null or actor_level not in (1, 2) or p_role_id is null
     or p_role_id <= actor_level or p_allowed is null
     or not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'Unsupported role or not authorized' using errcode = '42501';
  end if;
  select p.code into permission_code from public.permissions p where p.id = p_permission_id;
  if not found then raise exception 'Unknown permission'; end if;
  if actor_level = 2 and (
    (p_allowed and not public.drikapex_has_permission(permission_code))
    or exists (
      select 1 from public.user_roles affected join public.user_roles elevated
        on elevated.user_id = affected.user_id and elevated.role_id <= 2
      where affected.role_id = p_role_id
    )
  ) then
    raise exception 'Manager cannot grant unavailable permissions or change a role shared with privileged accounts' using errcode = '42501';
  end if;
  if p_allowed then
    insert into public.role_permissions(role_id, permission_id) values (p_role_id, p_permission_id)
      on conflict (role_id, permission_id) do nothing;
  else
    delete from public.role_permissions where role_id = p_role_id and permission_id = p_permission_id;
  end if;
end $$;
revoke all on function public.drikapex_set_role_permission(bigint, bigint, boolean) from public, anon;
grant execute on function public.drikapex_set_role_permission(bigint, bigint, boolean) to authenticated;

create function public.drikapex_set_user_role(p_user_id uuid, p_role_id bigint, p_assigned boolean)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare actor_level bigint;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Permission mutations require READ COMMITTED isolation';
  end if;
  perform pg_advisory_xact_lock(1743298741, 20261119);
  actor_level := public.drikapex_actor_level();
  if not public.drikapex_permission_target_ok(p_user_id) or p_role_id is null
    or p_role_id <= actor_level or p_assigned is null
    or not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'Unsupported role or not authorized' using errcode = '42501';
  end if;
  if actor_level = 2 and p_assigned and exists (
    select 1 from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = p_role_id and not public.drikapex_has_permission(p.code)
  ) then
    raise exception 'Manager cannot assign a role containing permissions they lack' using errcode = '42501';
  end if;
  if p_assigned then
    insert into public.user_roles(user_id, role_id)
      select p_user_id, p_role_id
      where not exists (select 1 from public.user_roles
                        where user_id = p_user_id and role_id = p_role_id);
  else
    delete from public.user_roles where user_id = p_user_id and role_id = p_role_id;
  end if;
end $$;
revoke all on function public.drikapex_set_user_role(uuid, bigint, boolean) from public, anon;
grant execute on function public.drikapex_set_user_role(uuid, bigint, boolean) to authenticated;

commit;

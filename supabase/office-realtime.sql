-- Shared, account-scoped virtual-office controls and activity feed.
-- Run in the Supabase SQL editor after the core workspace schema and RLS
-- policies and permission-control.sql are installed. The schema changes are
-- safe to reapply for upgrades.

create table if not exists public.office_actor_states (
  actor_user_id uuid primary key references public.profiles(id) on delete cascade,
  actor_username text not null,
  mode text not null default 'auto' check (mode in ('auto', 'manual')),
  action text not null default 'auto'
    check (action in (
      'auto', 'hold', 'personal', 'meeting', 'cafe', 'restroom', 'report',
      'summon_bird', 'summon_motorcycle', 'summon_police_motorcycle'
    )),
  status text not null default 'automatic',
  zone text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint office_actor_manual_expiry check (
    (mode = 'auto' and expires_at is null)
    or (mode = 'manual' and expires_at is not null)
  )
);

alter table public.office_actor_states
  drop constraint if exists office_actor_states_action_check;
alter table public.office_actor_states
  add constraint office_actor_states_action_check
  check (action in (
    'auto', 'hold', 'personal', 'meeting', 'cafe', 'restroom', 'report',
    'summon_bird', 'summon_motorcycle', 'summon_police_motorcycle'
  ));

create table if not exists public.office_activity_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_username text not null,
  action text not null,
  status text not null,
  zone text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.office_actor_states
  add column if not exists activity_detail text not null default 'Automatic behavior';
alter table public.office_activity_events
  add column if not exists activity_detail text not null default '';

create index if not exists office_activity_events_created_idx
  on public.office_activity_events (created_at desc);
create index if not exists office_activity_events_actor_created_idx
  on public.office_activity_events (actor_user_id, created_at desc);

create table if not exists public.office_runtime_state (
  id smallint primary key check (id = 1),
  is_active boolean not null default false,
  meeting_expires_at timestamptz,
  started_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint office_runtime_meeting_expiry check (
    (is_active and meeting_expires_at is not null)
    or (not is_active and meeting_expires_at is null)
  )
);

insert into public.office_runtime_state (id, is_active)
values (1, false)
on conflict (id) do nothing;

alter table public.office_actor_states enable row level security;
alter table public.office_activity_events enable row level security;
alter table public.office_runtime_state enable row level security;

drop policy if exists office_actor_states_read on public.office_actor_states;
create policy office_actor_states_read on public.office_actor_states
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
    )
    and public.drikapex_has_permission('office.view')
  );

drop policy if exists office_activity_events_read on public.office_activity_events;
create policy office_activity_events_read on public.office_activity_events
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
    )
    and public.drikapex_has_permission('office.view')
  );

drop policy if exists office_runtime_state_read on public.office_runtime_state;
create policy office_runtime_state_read on public.office_runtime_state
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
    )
    and public.drikapex_has_permission('office.view')
  );

grant select on public.office_actor_states,
  public.office_activity_events,
  public.office_runtime_state to authenticated;
revoke insert, update, delete on public.office_actor_states,
  public.office_activity_events,
  public.office_runtime_state from authenticated;
grant usage, select on sequence public.office_activity_events_id_seq
  to authenticated;

drop policy if exists office_floor_live_read on realtime.messages;
create policy office_floor_live_read on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'office-floor-live'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
    )
    and public.drikapex_has_permission('office.view')
  );

drop policy if exists office_floor_live_send on realtime.messages;
create policy office_floor_live_send on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.topic()) = 'office-floor-live'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
    )
    and public.drikapex_has_permission('office.view')
  );

create or replace function public.set_office_actor_command(p_action text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_profile public.profiles%rowtype;
  actor_name text;
  actor_status text;
  actor_detail text;
  actor_mode text;
  actor_zone text;
  expires_on timestamptz;
begin
  select * into actor_profile
  from public.profiles
  where id = auth.uid() and status = 'ACTIVE';

  if actor_profile.id is null then
    raise exception 'An active office profile is required.';
  end if;
  if not public.drikapex_has_permission('office.actor_control') then
    raise exception 'Virtual office control permission is required.' using errcode = '42501';
  end if;

  actor_name := lower(trim(coalesce(actor_profile.username, '')));
  if actor_name not in ('dung0001', 'phong0002', 'truong0003', 'anh0004') then
    raise exception 'This profile is not linked to a controllable office actor.';
  end if;

  if p_action not in (
    'auto', 'hold', 'personal', 'meeting', 'cafe', 'restroom', 'report',
    'open_meeting', 'summon_bird', 'summon_motorcycle',
    'summon_police_motorcycle'
  ) then
    raise exception 'Unsupported office action.';
  end if;

  if p_action in (
    'summon_bird', 'summon_motorcycle', 'summon_police_motorcycle'
  ) and not public.drikapex_has_permission('office.scene_effects') then
    raise exception 'Scene effect permission is required.' using errcode = '42501';
  end if;

  if p_action = 'open_meeting'
    and not public.drikapex_has_permission('office.scene_effects') then
    raise exception 'Meeting control permission is required.' using errcode = '42501';
  end if;
  if p_action = 'report' and actor_name = 'dung0001' then
    raise exception 'This action is not available for this office actor.';
  end if;

  actor_mode := case
    when p_action in (
      'auto', 'summon_bird', 'summon_motorcycle',
      'summon_police_motorcycle'
    ) then 'auto'
    else 'manual'
  end;
  expires_on := case when actor_mode = 'manual' then now() + interval '5 minutes' else null end;
  actor_zone := case p_action
    when 'personal' then case actor_name
      when 'dung0001' then 'administration'
      when 'anh0004' then 'documents'
      else 'executive'
    end
    when 'meeting' then 'meeting'
    when 'open_meeting' then 'meeting'
    when 'cafe' then 'cafe'
    when 'restroom' then 'restroom'
    when 'report' then 'administration'
    else null
  end;
  actor_status := case p_action
    when 'auto' then 'automatic'
    when 'hold' then 'manual_hold'
    when 'personal' then 'working'
    when 'meeting' then 'in_meeting'
    when 'open_meeting' then 'in_meeting'
    when 'cafe' then 'at_cafe'
    when 'restroom' then 'at_restroom'
    when 'report' then 'reporting'
    when 'summon_bird' then 'automatic'
    when 'summon_motorcycle' then 'automatic'
    when 'summon_police_motorcycle' then 'automatic'
  end;
  actor_detail := case p_action
    when 'auto' then 'Automatic behavior resumed'
    when 'hold' then 'Holding position'
    when 'personal' then 'Working in personal office'
    when 'meeting' then 'Joining the meeting room'
    when 'open_meeting' then 'Starting a team meeting'
    when 'cafe' then 'Taking a break at the cafe'
    when 'restroom' then 'Going to the restroom'
    when 'report' then 'Reporting to the manager'
    when 'summon_bird' then 'Called a bird flyby'
    when 'summon_motorcycle' then 'Called a regular motorcycle'
    when 'summon_police_motorcycle' then 'Called a tuned motorcycle with police'
  end;

  insert into public.office_actor_states (
    actor_user_id, actor_username, mode, action, status, activity_detail,
    zone, expires_at, updated_at
  )
  values (
    actor_profile.id, actor_name, actor_mode,
    case when p_action = 'open_meeting' then 'meeting' else p_action end,
    actor_status, actor_detail, actor_zone, expires_on, now()
  )
  on conflict (actor_user_id) do update set
    actor_username = excluded.actor_username,
    mode = excluded.mode,
    action = excluded.action,
    status = excluded.status,
    activity_detail = excluded.activity_detail,
    zone = excluded.zone,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;

  if p_action = 'open_meeting' then
    update public.office_runtime_state
      set is_active = true,
          meeting_expires_at = now() + interval '5 minutes',
          started_by = actor_profile.id,
          updated_at = now()
      where id = 1;

    insert into public.office_activity_events (
      actor_user_id, actor_username, action, status, activity_detail,
      zone, created_by
    )
    select p.id, lower(p.username), 'meeting_started', 'in_meeting',
      'Team meeting started', 'meeting', actor_profile.id
    from public.profiles p
    where p.status = 'ACTIVE' and p.username is not null;
  else
    insert into public.office_activity_events (
      actor_user_id, actor_username, action, status, activity_detail,
      zone, created_by
    )
    values (
      actor_profile.id,
      actor_name,
      p_action,
      actor_status,
      actor_detail,
      actor_zone,
      actor_profile.id
    );
  end if;
end;
$$;

create or replace function public.touch_office_actor_control()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.drikapex_has_permission('office.actor_control') then
    raise exception 'Virtual office control permission is required.' using errcode = '42501';
  end if;
  update public.office_actor_states
    set expires_at = now() + interval '5 minutes',
        updated_at = now()
    where actor_user_id = auth.uid()
      and mode = 'manual'
      and expires_at > now();
end;
$$;

create or replace function public.publish_office_actor_status(
  p_status text,
  p_zone text,
  p_activity_detail text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_profile public.profiles%rowtype;
  actor_name text;
  safe_detail text;
  previous_state public.office_actor_states%rowtype;
begin
  select * into actor_profile
  from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  actor_name := lower(trim(coalesce(actor_profile.username, '')));
  safe_detail := nullif(trim(coalesce(p_activity_detail, '')), '');

  if actor_profile.id is null
    or not public.drikapex_has_permission('office.actor_control')
    or actor_name not in ('dung0001', 'phong0002', 'truong0003', 'anh0004')
    or p_status not in (
      'walking', 'working', 'chilling', 'eating', 'sleeping',
      'calling_shipper', 'waiting_for_shipper', 'receiving_delivery',
      'storing_delivery', 'in_meeting', 'at_restroom', 'reporting',
      'at_cafe', 'manual_hold', 'automatic'
    )
    or safe_detail is null
    or length(safe_detail) > 160
    or p_zone is not null and p_zone not in (
      'administration', 'executive', 'documents', 'meeting', 'cafe',
      'restroom', 'communication', 'personnel', 'reception', 'lounge'
    )
  then
    raise exception 'Invalid office actor status.';
  end if;

  select * into previous_state
  from public.office_actor_states
  where actor_user_id = actor_profile.id;

  insert into public.office_actor_states (
    actor_user_id, actor_username, mode, action, status, activity_detail,
    zone, expires_at, updated_at
  )
  values (
    actor_profile.id, actor_name, 'auto', 'auto', p_status, safe_detail,
    p_zone, null, now()
  )
  on conflict (actor_user_id) do update set
    actor_username = excluded.actor_username,
    mode = case
      when public.office_actor_states.mode = 'manual'
        and public.office_actor_states.expires_at > now()
      then public.office_actor_states.mode else 'auto'
    end,
    action = case
      when public.office_actor_states.mode = 'manual'
        and public.office_actor_states.expires_at > now()
      then public.office_actor_states.action else 'auto'
    end,
    status = excluded.status,
    activity_detail = excluded.activity_detail,
    zone = excluded.zone,
    expires_at = case
      when public.office_actor_states.mode = 'manual'
        and public.office_actor_states.expires_at > now()
      then public.office_actor_states.expires_at else null
    end,
    updated_at = now();

  if previous_state.actor_user_id is null
    or previous_state.status is distinct from p_status
    or previous_state.activity_detail is distinct from safe_detail
    or previous_state.zone is distinct from p_zone
  then
    insert into public.office_activity_events (
      actor_user_id, actor_username, action, status, activity_detail,
      zone, created_by
    )
    values (
      actor_profile.id, actor_name, 'status', p_status, safe_detail,
      p_zone, actor_profile.id
    );
  end if;
end;
$$;

create or replace function public.publish_office_actor_status(
  p_status text,
  p_zone text
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.publish_office_actor_status(p_status, p_zone, p_status);
$$;

create or replace function public.expire_office_controls()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expired_actor record;
begin
  for expired_actor in
    update public.office_actor_states
      set mode = 'auto',
          action = 'auto',
          status = 'automatic',
          activity_detail = 'Manual control expired; automatic behavior resumed',
          zone = null,
          expires_at = null,
          updated_at = now()
      where mode = 'manual' and expires_at <= now()
      returning actor_user_id, actor_username
  loop
    insert into public.office_activity_events (
      actor_user_id, actor_username, action, status, activity_detail,
      created_by
    )
    values (
      expired_actor.actor_user_id,
      expired_actor.actor_username,
      'auto',
      'automatic',
      'Manual control expired; automatic behavior resumed',
      auth.uid()
    );
  end loop;

  if exists (
    select 1 from public.office_runtime_state
    where id = 1 and is_active and meeting_expires_at <= now()
  ) then
    update public.office_runtime_state
      set is_active = false,
          meeting_expires_at = null,
          started_by = null,
          updated_at = now()
      where id = 1;

    insert into public.office_activity_events (
      actor_user_id, actor_username, action, status, activity_detail,
      zone, created_by
    )
    select p.id, lower(p.username), 'meeting_ended', 'automatic',
      'Team meeting ended', 'meeting', auth.uid()
    from public.profiles p
    where p.status = 'ACTIVE' and p.username is not null;
  end if;
end;
$$;

revoke all on function public.set_office_actor_command(text) from public;
revoke all on function public.touch_office_actor_control() from public;
revoke all on function public.publish_office_actor_status(text, text, text) from public;
revoke all on function public.publish_office_actor_status(text, text) from public;
revoke all on function public.expire_office_controls() from public;
grant execute on function public.set_office_actor_command(text) to authenticated;
grant execute on function public.touch_office_actor_control() to authenticated;
grant execute on function public.publish_office_actor_status(text, text) to authenticated;
grant execute on function public.publish_office_actor_status(text, text, text) to authenticated;
grant execute on function public.expire_office_controls() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'office_actor_states'
  ) then
    alter publication supabase_realtime add table public.office_actor_states;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'office_activity_events'
  ) then
    alter publication supabase_realtime add table public.office_activity_events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'office_runtime_state'
  ) then
    alter publication supabase_realtime add table public.office_runtime_state;
  end if;
end;
$$;

-- Private PIN recovery state. Apply as an administrator before deploying the Edge Function.
-- password_recovery_request returns 'queued' or 'limited:<seconds until the next allowed request>'.
begin;

create table if not exists public.password_recovery_limits (
  account_key text primary key,
  last_request_at timestamptz,
  attempts_started_at timestamptz,
  attempts integer not null default 0
);

create table if not exists public.password_recovery_challenges (
  challenge_hash text primary key,
  account_key text not null references public.password_recovery_limits(account_key),
  user_id uuid references auth.users(id) on delete cascade,
  pin_hash text,
  requested_at timestamptz not null default now(),
  issued_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  reset_hash text unique,
  reset_expires_at timestamptz,
  consumed_at timestamptz
);
alter table public.password_recovery_challenges add column if not exists emailed_at timestamptz;
alter table public.password_recovery_limits add column if not exists requests_started_at timestamptz;
alter table public.password_recovery_limits add column if not exists request_count integer not null default 0;

alter table public.password_recovery_limits enable row level security;
alter table public.password_recovery_challenges enable row level security;
revoke all on public.password_recovery_limits from public, anon, authenticated;
revoke all on public.password_recovery_challenges from public, anon, authenticated;

create or replace function public.password_recovery_request(
  p_account_key text, p_email text, p_challenge_hash text
) returns text
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  account_limit public.password_recovery_limits%rowtype;
  global_limit public.password_recovery_limits%rowtype;
  target_id uuid;
  wait_seconds integer;
begin
  if p_account_key is null or p_challenge_hash is null
    or p_account_key !~ '^[a-f0-9]{64}$' or p_challenge_hash !~ '^[a-f0-9]{64}$' or p_email is null
    or length(p_email) > 254 then
    raise exception 'Invalid recovery request' using errcode = '22023';
  end if;

  insert into public.password_recovery_limits (account_key) values ('global')
    on conflict do nothing;
  select * into global_limit from public.password_recovery_limits where account_key = 'global' for update;
  if global_limit.attempts_started_at is null or global_limit.attempts_started_at <= now() - interval '1 minute' then
    update public.password_recovery_limits set attempts_started_at = now(), attempts = 0 where account_key = 'global';
    global_limit.attempts := 0;
  end if;
  if global_limit.attempts >= 30 then
    return 'limited:' || greatest(1, ceil(extract(epoch from global_limit.attempts_started_at + interval '1 minute' - now())))::integer;
  end if;
  update public.password_recovery_limits set attempts = attempts + 1 where account_key = 'global';

  insert into public.password_recovery_limits (account_key) values (p_account_key)
    on conflict do nothing;
  select * into account_limit from public.password_recovery_limits where account_key = p_account_key for update;
  -- Resend cooldown 60 seconds; at most 5 requests and 5 PIN attempts per account per 30 minutes.
  wait_seconds := coalesce(ceil(greatest(
    extract(epoch from account_limit.last_request_at + interval '60 seconds' - now()),
    case when account_limit.attempts >= 5 then extract(epoch from account_limit.attempts_started_at + interval '30 minutes' - now()) end,
    case when account_limit.request_count >= 5 then extract(epoch from account_limit.requests_started_at + interval '30 minutes' - now()) end
  )), 0)::integer;
  if wait_seconds > 0 then return 'limited:' || wait_seconds; end if;
  update public.password_recovery_limits set last_request_at = now(),
      request_count = case when requests_started_at is null or requests_started_at <= now() - interval '30 minutes' then 1 else request_count + 1 end,
      requests_started_at = case when requests_started_at is null or requests_started_at <= now() - interval '30 minutes' then now() else requests_started_at end
    where account_key = p_account_key;
  update public.password_recovery_challenges set consumed_at = now()
    where account_key = p_account_key and consumed_at is null;

  if (select count(*) from auth.users u
      join public.profiles p on p.id = u.id
      where lower(u.email) = lower(p_email) and p.status = 'ACTIVE'
        and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
        and exists (select 1 from public.user_roles r where r.user_id = u.id)) = 1 then
    select u.id into target_id from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(p_email) and p.status = 'ACTIVE'
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
      and exists (select 1 from public.user_roles r where r.user_id = u.id);
  end if;

  delete from public.password_recovery_challenges where expires_at < now() - interval '1 day';
  insert into public.password_recovery_challenges (challenge_hash, account_key, user_id, expires_at)
  values (p_challenge_hash, p_account_key, target_id, now() + interval '30 minutes');
  return 'queued';
end;
$$;

create or replace function public.password_recovery_is_owner(p_actor uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$ select public.drikapex_is_owner_user(p_actor); $$;

drop function if exists public.password_recovery_owner_requests(uuid);
create function public.password_recovery_owner_requests(p_actor uuid)
returns table (request_id text, display_name text, email text, requested_at timestamptz, expires_at timestamptz, issued boolean, emailed boolean)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not public.password_recovery_is_owner(p_actor) then
    raise exception 'Only an active owner may view recovery requests' using errcode = '42501';
  end if;
  return query
    select c.challenge_hash, coalesce(p.display_name, p.username, u.email)::text,
      u.email::text, c.requested_at, c.expires_at, c.pin_hash is not null, c.emailed_at is not null
    from public.password_recovery_challenges c
    join auth.users u on u.id = c.user_id join public.profiles p on p.id = u.id
    where c.consumed_at is null and c.reset_hash is null and c.expires_at > now()
      and p.status = 'ACTIVE' and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and exists (select 1 from public.user_roles r where r.user_id = u.id)
    order by c.requested_at desc limit 100;
end;
$$;

create or replace function public.password_recovery_issue(p_actor uuid, p_challenge_hash text, p_pin_hash text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not public.password_recovery_is_owner(p_actor) then
    raise exception 'Only an active owner may issue a PIN' using errcode = '42501';
  end if;
  if p_pin_hash is null or p_pin_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  update public.password_recovery_challenges c
    set pin_hash = p_pin_hash, issued_by = p_actor, expires_at = now() + interval '10 minutes'
    where c.challenge_hash = p_challenge_hash and c.consumed_at is null
      and c.pin_hash is null and c.reset_hash is null and c.expires_at > now()
      and exists (
        select 1 from auth.users u join public.profiles p on p.id = u.id
        where u.id = c.user_id and p.status = 'ACTIVE' and u.deleted_at is null
          and (u.banned_until is null or u.banned_until <= now())
          and exists (select 1 from public.user_roles r where r.user_id = u.id)
      );
  return found;
end;
$$;

-- Server-issued PIN for owner email delivery; returns no row for unknown or ineligible accounts.
create or replace function public.password_recovery_email_issue(p_challenge_hash text, p_pin_hash text)
returns table (target_name text, target_email text, pin_expires_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if p_challenge_hash is null or p_pin_hash is null
    or p_challenge_hash !~ '^[a-f0-9]{64}$' or p_pin_hash !~ '^[a-f0-9]{64}$' then return; end if;
  return query
    update public.password_recovery_challenges c
      set pin_hash = p_pin_hash, emailed_at = now()
      from auth.users u join public.profiles p on p.id = u.id
      where c.challenge_hash = p_challenge_hash and u.id = c.user_id
        and c.consumed_at is null and c.pin_hash is null and c.reset_hash is null and c.expires_at > now()
        and p.status = 'ACTIVE' and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())
        and exists (select 1 from public.user_roles r where r.user_id = u.id)
      returning coalesce(p.display_name, p.username, u.email)::text, u.email::text, c.expires_at;
end;
$$;

-- Returns an undelivered emailed request to the owner queue for manual issuance.
create or replace function public.password_recovery_email_release(p_challenge_hash text, p_pin_hash text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  update public.password_recovery_challenges
    set pin_hash = null, emailed_at = null
    where challenge_hash = p_challenge_hash and pin_hash = p_pin_hash and emailed_at is not null
      and issued_by is null and reset_hash is null and consumed_at is null;
  return found;
end;
$$;

create or replace function public.password_recovery_verify(
  p_challenge_hash text, p_pin_hash text, p_reset_hash text
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  account_id text;
  limits public.password_recovery_limits%rowtype;
  challenge public.password_recovery_challenges%rowtype;
begin
  if p_challenge_hash is null or p_pin_hash is null or p_reset_hash is null
    or p_challenge_hash !~ '^[a-f0-9]{64}$' or p_pin_hash !~ '^[a-f0-9]{64}$'
    or p_reset_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  select account_key into account_id from public.password_recovery_challenges where challenge_hash = p_challenge_hash;
  if account_id is null then return false; end if;
  select * into limits from public.password_recovery_limits where account_key = account_id for update;
  select * into challenge from public.password_recovery_challenges where challenge_hash = p_challenge_hash for update;
  if challenge.consumed_at is not null or challenge.expires_at <= now()
    or challenge.pin_hash is null or challenge.reset_hash is not null then return false; end if;
  if limits.attempts_started_at is null or limits.attempts_started_at <= now() - interval '30 minutes' then
    update public.password_recovery_limits set attempts_started_at = now(), attempts = 0 where account_key = account_id;
    limits.attempts := 0;
  end if;
  if limits.attempts >= 5 then return false; end if;
  update public.password_recovery_limits set attempts = attempts + 1 where account_key = account_id;
  if challenge.user_id is null or challenge.pin_hash <> p_pin_hash then return false; end if;
  update public.password_recovery_challenges
    set reset_hash = p_reset_hash, reset_expires_at = now() + interval '10 minutes'
    where challenge_hash = p_challenge_hash;
  return true;
end;
$$;

create or replace function public.password_recovery_consume(p_reset_hash text)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare target uuid;
begin
  if p_reset_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  update public.password_recovery_challenges c set consumed_at = now()
  where c.reset_hash = p_reset_hash and c.consumed_at is null and c.reset_expires_at > now()
    and exists (
      select 1 from auth.users u join public.profiles p on p.id = u.id
      where u.id = c.user_id and p.status = 'ACTIVE' and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())
        and exists (select 1 from public.user_roles r where r.user_id = u.id)
    )
  returning c.user_id into target;
  return target;
end;
$$;

revoke all on function public.password_recovery_request(text,text,text) from public, anon, authenticated;
revoke all on function public.password_recovery_is_owner(uuid) from public, anon, authenticated;
revoke all on function public.password_recovery_owner_requests(uuid) from public, anon, authenticated;
revoke all on function public.password_recovery_issue(uuid,text,text) from public, anon, authenticated;
revoke all on function public.password_recovery_email_issue(text,text) from public, anon, authenticated;
revoke all on function public.password_recovery_email_release(text,text) from public, anon, authenticated;
revoke all on function public.password_recovery_verify(text,text,text) from public, anon, authenticated;
revoke all on function public.password_recovery_consume(text) from public, anon, authenticated;
grant execute on function public.password_recovery_request(text,text,text) to service_role;
grant execute on function public.password_recovery_is_owner(uuid) to service_role;
grant execute on function public.password_recovery_owner_requests(uuid) to service_role;
grant execute on function public.password_recovery_issue(uuid,text,text) to service_role;
grant execute on function public.password_recovery_email_issue(text,text) to service_role;
grant execute on function public.password_recovery_email_release(text,text) to service_role;
grant execute on function public.password_recovery_verify(text,text,text) to service_role;
grant execute on function public.password_recovery_consume(text) to service_role;

commit;

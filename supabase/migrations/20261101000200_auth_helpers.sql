-- ============================================================================
-- Authorization helpers + profile bootstrap
-- All helpers are SECURITY DEFINER with a pinned search_path so they can read
-- memberships/assignments without recursing through RLS, and so a caller
-- cannot hijack them with objects in another schema.
-- ============================================================================

create or replace function app.uid() returns uuid
language sql stable as $$ select auth.uid() $$;

create or replace function app.is_super_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role = 'SUPER_ADMIN' and m.is_active
  )
$$;

create or replace function app.has_branch_role(p_branch uuid, p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.is_active
      and m.branch_id = p_branch and m.role = any (p_roles)
  )
$$;

-- Admin over a branch: SUPER_ADMIN anywhere, or BRANCH_ADMIN of that branch.
create or replace function app.is_branch_admin(p_branch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_super_admin() or app.has_branch_role(p_branch, array['BRANCH_ADMIN']::public.app_role[])
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.is_active and m.role <> 'CLIENT'
  )
$$;

create or replace function app.is_assigned(p_order uuid, p_role public.assignment_role) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.order_assignments a
    where a.order_id = p_order and a.user_id = auth.uid() and a.role = p_role and a.is_active
  )
$$;

-- The single answer to "may the current user see this order?"
create or replace function app.can_view_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order
      and (
        o.client_id = auth.uid()
        or app.is_branch_admin(o.branch_id)
        or exists (
          select 1 from public.order_assignments a
          where a.order_id = o.id and a.user_id = auth.uid() and a.is_active
        )
      )
  )
$$;

-- Staff-side access (excludes the client). Used for internal material.
create or replace function app.can_work_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order
      and (
        app.is_branch_admin(o.branch_id)
        or exists (
          select 1 from public.order_assignments a
          where a.order_id = o.id and a.user_id = auth.uid() and a.is_active
        )
      )
  )
$$;

-- Staff may see a profile when they share a branch with it, or when it is a
-- client of an order they can work on.
create or replace function app.can_view_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_profile = auth.uid()
    or app.is_super_admin()
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.branch_id = mine.branch_id and theirs.is_active
      where mine.user_id = auth.uid() and mine.is_active and mine.role <> 'CLIENT'
        and theirs.user_id = p_profile
    )
    or exists (
      select 1 from public.orders o
      where o.client_id = p_profile and app.can_work_order(o.id)
    )
    -- clients can see the staff assigned to their own orders
    or exists (
      select 1 from public.order_assignments a
      join public.orders o on o.id = a.order_id
      where a.user_id = p_profile and a.is_active and o.client_id = auth.uid()
    )
$$;

-- ---------------------------------------------------------------------------
-- Audit + outbox writers (used by other SECURITY DEFINER functions)
-- ---------------------------------------------------------------------------
create or replace function app.audit(p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
$$;

create or replace function app.emit_event(p_event_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.integration_events (event_type, entity_type, entity_id, payload)
  values (p_event_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb))
$$;

create or replace function app.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user, p_type, p_title, coalesce(p_body, ''), p_link)
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile + CLIENT membership
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;

  insert into public.memberships (user_id, role) values (new.id, 'CLIENT')
  on conflict do nothing;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
  values (new.id, 'user.registered', 'profile', new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Keep profile email in sync when the auth email changes.
create or replace function app.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function app.handle_user_email_change();

-- Postgres grants EXECUTE to PUBLIC by default. Lock everything down, then
-- grant only the read-only predicates RLS policies need.
revoke execute on all functions in schema app from public;
grant execute on function
  app.uid(), app.is_super_admin(), app.has_branch_role(uuid, public.app_role[]),
  app.is_branch_admin(uuid), app.is_staff(), app.is_assigned(uuid, public.assignment_role),
  app.can_view_order(uuid), app.can_work_order(uuid), app.can_view_profile(uuid)
to authenticated, service_role;
grant execute on function app.audit(text, text, uuid, jsonb), app.emit_event(text, text, uuid, jsonb),
  app.notify(uuid, text, text, text, text)
to service_role;

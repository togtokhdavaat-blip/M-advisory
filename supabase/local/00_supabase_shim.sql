-- ============================================================================
-- LOCAL DEVELOPMENT ONLY — minimal stand-in for the objects Supabase provides.
-- Never run this file against a Supabase project: these objects already exist
-- there (and are richer). It lets the real migrations and RLS policies run on a
-- plain PostgreSQL 15+/16 server so they can be tested without Docker.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- The connecting role (postgres) must be able to SET ROLE to these.
grant anon, authenticated, service_role to current_user;

create extension if not exists pgcrypto;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Subset of Supabase's auth.users. Column names match Supabase so code that
-- reads id / email / encrypted_password / raw_user_meta_data is portable.
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  phone               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  raw_app_meta_data   jsonb not null default '{}'::jsonb,
  last_sign_in_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Same semantics as Supabase: claims come from the request.jwt.claims GUC.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

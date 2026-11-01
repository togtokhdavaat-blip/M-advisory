-- ============================================================================
-- M ADVISORY — core schema
-- Conventions
--   * Every primary key is a UUID. Human-readable numbers (order_number,
--     report_number) are separate, unique columns.
--   * Money is stored as bigint MNT (whole tugrik). No floats anywhere.
--   * created_at / updated_at on every mutable table.
--   * Order status, payment status and report status are three separate
--     columns on three separate tables, each with its own state machine.
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('CLIENT', 'ADVISOR', 'REVIEWER', 'BRANCH_ADMIN', 'SUPER_ADMIN');

create type public.order_status as enum (
  'draft', 'awaiting_payment', 'paid', 'assigned', 'in_progress',
  'needs_information', 'under_review', 'revision_requested', 'completed', 'cancelled'
);

create type public.payment_status as enum (
  'pending', 'paid', 'failed', 'expired', 'cancelled', 'refund_pending', 'refunded'
);

create type public.report_status as enum ('draft', 'submitted', 'revision_requested', 'approved', 'published');

create type public.risk_level as enum ('low', 'medium', 'high', 'not_verified');

create type public.property_type as enum (
  'apartment', 'new_project', 'house', 'land', 'office', 'retail', 'commercial_object'
);

create type public.party_role as enum ('owner', 'seller', 'buyer', 'representative', 'developer');

create type public.assignment_role as enum ('advisor', 'reviewer');

create type public.pricing_model as enum ('fixed', 'percentage', 'hourly', 'quote');

create type public.price_status as enum ('proposed', 'approved', 'retired');

create type public.document_scan_status as enum ('pending', 'clean', 'infected', 'skipped', 'error');

create type public.review_decision as enum ('approved', 'revision_requested');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_]{2,16}$'),
  name        text not null,
  address     text,
  phone       text,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 200),
  email       text,
  phone       text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'),
  locale      text not null default 'mn' check (locale in ('mn', 'en')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

-- A user can hold several roles. CLIENT and SUPER_ADMIN are platform-wide
-- (branch_id null); staff roles are scoped to a branch.
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  branch_id   uuid references public.branches (id) on delete restrict,
  role        public.app_role not null,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint memberships_branch_scope check (
    (role in ('CLIENT', 'SUPER_ADMIN') and branch_id is null)
    or (role in ('ADVISOR', 'REVIEWER', 'BRANCH_ADMIN') and branch_id is not null)
  )
);
create unique index memberships_unique_idx
  on public.memberships (user_id, role, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index memberships_branch_idx on public.memberships (branch_id, role) where is_active;

-- ---------------------------------------------------------------------------
-- Service catalogue (all content is admin-managed)
-- ---------------------------------------------------------------------------
create table public.services (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z_]{2,32}$'),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),
  name            text not null,
  tagline         text not null default '',
  description     text not null default '',
  deliverable     text not null default '',
  scope_items     jsonb not null default '[]'::jsonb check (jsonb_typeof(scope_items) = 'array'),
  excluded_items  jsonb not null default '[]'::jsonb check (jsonb_typeof(excluded_items) = 'array'),
  turnaround_text text not null default '',
  -- is_active: shown on the public site. is_orderable: online checkout enabled.
  is_active       boolean not null default false,
  is_orderable    boolean not null default false,
  sort_order      int not null default 100,
  terms_version   text not null default 'v1',
  terms_text      text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint services_orderable_requires_active check (not is_orderable or is_active)
);

-- Versioned price list. A row is never edited once an order references it;
-- a new version is inserted instead (enforced in app.upsert_service_price).
create table public.service_prices (
  id                uuid primary key default gen_random_uuid(),
  service_id        uuid not null references public.services (id) on delete cascade,
  version           int not null check (version > 0),
  segment           public.property_type,             -- null = applies to all segments
  value_min_mnt     bigint check (value_min_mnt is null or value_min_mnt >= 0),
  value_max_mnt     bigint check (value_max_mnt is null or value_max_mnt > 0),
  pricing_model     public.pricing_model not null default 'fixed',
  amount_mnt        bigint check (amount_mnt is null or amount_mnt >= 0),
  percent_bps       int check (percent_bps is null or (percent_bps between 0 and 10000)),
  min_fee_mnt       bigint check (min_fee_mnt is null or min_fee_mnt >= 0),
  label             text not null default '',
  status            public.price_status not null default 'proposed',
  effective_from    timestamptz not null default now(),
  effective_to      timestamptz,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  constraint service_prices_value_range check (value_max_mnt is null or value_min_mnt is null or value_max_mnt > value_min_mnt),
  constraint service_prices_model_fields check (
    (pricing_model = 'fixed' and amount_mnt is not null)
    or (pricing_model = 'hourly' and amount_mnt is not null)
    or (pricing_model = 'percentage' and percent_bps is not null)
    or (pricing_model = 'quote')
  )
);
create index service_prices_lookup_idx on public.service_prices (service_id, segment, status) where effective_to is null;

-- Documents / information a service needs from the client.
create table public.service_requirements (
  id             uuid primary key default gen_random_uuid(),
  service_id     uuid not null references public.services (id) on delete cascade,
  code           text not null check (code ~ '^[a-z0-9_]{2,48}$'),
  label          text not null,
  help_text      text not null default '',
  document_type  text,
  is_required    boolean not null default false,
  applies_to     public.property_type[],               -- null = all segments
  sort_order     int not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (service_id, code)
);

-- ---------------------------------------------------------------------------
-- Properties and the people around them
-- ---------------------------------------------------------------------------
create table public.properties (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid not null references public.profiles (id),
  property_type        public.property_type not null,
  title                text not null default '' check (char_length(title) <= 200),
  city                 text not null default 'Улаанбаатар',
  district             text check (char_length(district) <= 80),
  khoroo               text check (char_length(khoroo) <= 80),
  address              text check (char_length(address) <= 500),
  project_name         text check (char_length(project_name) <= 200),
  area_sqm             numeric(12, 2) check (area_sqm is null or area_sqm > 0),
  rooms                smallint check (rooms is null or rooms between 0 and 100),
  floor                smallint,
  total_floors         smallint,
  build_year           smallint check (build_year is null or build_year between 1900 and 2100),
  registration_number  text check (char_length(registration_number) <= 64),  -- улсын бүртгэлийн дугаар
  cadastral_number     text check (char_length(cadastral_number) <= 64),     -- нэгж талбарын дугаар
  asking_price_mnt     bigint check (asking_price_mnt is null or asking_price_mnt >= 0),
  listing_url          text check (listing_url is null or listing_url ~ '^https?://'),
  notes                text check (char_length(notes) <= 4000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index properties_created_by_idx on public.properties (created_by);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq;

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null unique,
  client_id          uuid not null references public.profiles (id),
  branch_id          uuid not null references public.branches (id),
  service_id         uuid not null references public.services (id),
  property_id        uuid references public.properties (id),
  status             public.order_status not null default 'draft',
  -- Snapshot of what the client agreed to at submission time.
  service_price_id   uuid references public.service_prices (id),
  amount_mnt         bigint check (amount_mnt is null or amount_mnt >= 0),
  price_snapshot     jsonb,
  terms_version      text,
  terms_snapshot     text,
  client_notes       text check (char_length(client_notes) <= 4000),
  submitted_at       timestamptz,
  paid_at            timestamptz,
  due_at             timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint orders_snapshot_when_submitted check (
    status in ('draft', 'cancelled') or (amount_mnt is not null and price_snapshot is not null and terms_version is not null)
  )
);
create index orders_client_idx on public.orders (client_id, created_at desc);
create index orders_branch_status_idx on public.orders (branch_id, status);
create index orders_service_idx on public.orders (service_id);

-- The owner, the buyer and the client (orderer) are distinct concepts.
-- The client is orders.client_id; everyone else is a party.
create table public.order_parties (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  party_role   public.party_role not null,
  full_name    text not null check (char_length(full_name) between 1 and 200),
  phone        text check (char_length(phone) <= 32),
  email        text check (char_length(email) <= 200),
  is_client    boolean not null default false,
  notes        text check (char_length(notes) <= 1000),
  created_at   timestamptz not null default now()
);
create index order_parties_order_idx on public.order_parties (order_id);

create table public.order_assignments (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  user_id        uuid not null references public.profiles (id),
  role           public.assignment_role not null,
  assigned_by    uuid references public.profiles (id),
  is_active      boolean not null default true,
  assigned_at    timestamptz not null default now(),
  unassigned_at  timestamptz
);
-- One active advisor and one active reviewer per order.
create unique index order_assignments_one_active_idx on public.order_assignments (order_id, role) where is_active;
create index order_assignments_user_idx on public.order_assignments (user_id) where is_active;

create table public.order_status_history (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  changed_by   uuid references public.profiles (id),
  reason       text,
  created_at   timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.order_feedback (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders (id) on delete cascade,
  client_id   uuid not null references public.profiles (id),
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (char_length(comment) <= 2000),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Payments (own state machine)
-- ---------------------------------------------------------------------------
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id),
  amount_mnt           bigint not null check (amount_mnt > 0),
  currency             text not null default 'MNT' check (currency = 'MNT'),
  status               public.payment_status not null default 'pending',
  provider             text not null check (provider in ('qpay', 'mock', 'bank_transfer')),
  provider_invoice_id  text,
  provider_payment_id  text,
  idempotency_key      text not null unique,
  invoice_payload      jsonb,           -- QR text, deeplinks etc. returned by the provider
  expires_at           timestamptz,
  paid_at              timestamptz,
  failure_reason       text,
  refunded_amount_mnt  bigint not null default 0 check (refunded_amount_mnt >= 0),
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint payments_refund_le_amount check (refunded_amount_mnt <= amount_mnt),
  unique (provider, provider_invoice_id)
);
create index payments_order_idx on public.payments (order_id);
-- Duplicate payment protection: at most one successful payment per order.
create unique index payments_one_paid_per_order_idx on public.payments (order_id) where status in ('paid', 'refund_pending', 'refunded');
-- At most one open invoice per order at a time.
create unique index payments_one_pending_per_order_idx on public.payments (order_id) where status = 'pending';

-- Raw provider callbacks / checks. (provider, provider_event_id) makes webhook
-- processing idempotent.
create table public.payment_events (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid references public.payments (id),
  provider           text not null,
  provider_event_id  text not null,
  event_type         text not null,
  payload            jsonb not null default '{}'::jsonb,
  verified           boolean not null default false,
  processed_at       timestamptz,
  processing_error   text,
  created_at         timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index payment_events_payment_idx on public.payment_events (payment_id);

-- ---------------------------------------------------------------------------
-- Documents (files live in a private storage bucket; this is metadata)
-- ---------------------------------------------------------------------------
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  storage_bucket   text not null default 'order-documents',
  storage_path     text not null unique check (storage_path ~ '^[a-z0-9/_.-]+$'),
  original_name    text not null check (char_length(original_name) <= 255),
  mime_type        text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes       bigint not null check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  sha256           text check (sha256 ~ '^[a-f0-9]{64}$'),
  document_type    text not null default 'other',
  requirement_id   uuid references public.service_requirements (id),
  uploaded_by      uuid not null references public.profiles (id),
  is_internal      boolean not null default false,     -- staff work papers, hidden from client
  scan_status      public.document_scan_status not null default 'pending',
  retention_until  date,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index documents_order_idx on public.documents (order_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Reports (own state machine, versioned)
-- ---------------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  report_number    text not null,
  version          int not null check (version > 0),
  status           public.report_status not null default 'draft',
  content          jsonb not null default '{}'::jsonb,
  overall_risk     public.risk_level,
  file_path        text,
  file_sha256      text,
  prepared_by      uuid not null references public.profiles (id),
  submitted_at     timestamptz,
  approved_by      uuid references public.profiles (id),
  approved_at      timestamptz,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (order_id, version),
  constraint reports_publish_requires_approval check (
    status <> 'published' or (approved_by is not null and approved_at is not null and published_at is not null)
  ),
  constraint reports_reviewer_not_preparer check (approved_by is null or approved_by <> prepared_by)
);
create index reports_order_idx on public.reports (order_id, version desc);

create table public.report_reviews (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  reviewer_id  uuid not null references public.profiles (id),
  decision     public.review_decision not null,
  comments     text check (char_length(comments) <= 8000),
  created_at   timestamptz not null default now()
);
create index report_reviews_report_idx on public.report_reviews (report_id);

-- ---------------------------------------------------------------------------
-- Notifications, consents, audit, integration outbox
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null default '',
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  order_id      uuid references public.orders (id) on delete set null,
  consent_type  text not null check (consent_type in ('terms_of_service', 'privacy_policy', 'data_processing', 'service_terms', 'marketing')),
  version       text not null,
  text_sha256   text,
  granted_at    timestamptz not null default now(),
  withdrawn_at  timestamptz,
  ip_address    inet,
  user_agent    text
);
create index consents_user_idx on public.consents (user_id, consent_type);

-- Append-only. No UPDATE/DELETE grants exist for application roles.
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  ip_address   inet,
  created_at   timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- Transactional outbox for future TsogtsAI CRM / finance integrations.
create table public.integration_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text not null,                 -- e.g. order.paid, report.published
  entity_type   text not null,
  entity_id     uuid not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  attempts      int not null default 0,
  last_error    text
);
create index integration_events_pending_idx on public.integration_events (created_at) where delivered_at is null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'branches', 'profiles', 'memberships', 'services', 'service_requirements',
    'properties', 'orders', 'payments', 'reports'
  ] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function app.touch_updated_at()', t, t);
  end loop;
end $$;

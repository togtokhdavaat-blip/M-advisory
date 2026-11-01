-- ============================================================================
-- Order workflow: state machine, pricing snapshot, drafts, assignment.
-- Clients and staff never write to orders directly; they call these
-- SECURITY DEFINER functions, which validate the actor and the transition.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Transition rules — the single source of truth for the order state machine.
-- actor: client | advisor | reviewer | admin | system
-- (src/lib/orders/state-machine.ts mirrors this table; a test keeps them equal.)
-- ---------------------------------------------------------------------------
create table app.order_transition_rules (
  from_status  public.order_status not null,
  to_status    public.order_status not null,
  actor        text not null check (actor in ('client', 'advisor', 'reviewer', 'admin', 'system')),
  primary key (from_status, to_status, actor)
);

insert into app.order_transition_rules (from_status, to_status, actor) values
  ('draft',              'awaiting_payment',   'client'),
  ('draft',              'cancelled',          'client'),
  ('draft',              'cancelled',          'admin'),
  ('awaiting_payment',   'draft',              'client'),   -- reopen to edit (no paid invoice)
  ('awaiting_payment',   'paid',               'system'),   -- only a verified payment
  ('awaiting_payment',   'cancelled',          'client'),
  ('awaiting_payment',   'cancelled',          'admin'),
  ('paid',               'assigned',           'admin'),
  ('paid',               'cancelled',          'admin'),    -- refund workflow follows
  ('assigned',           'in_progress',        'advisor'),
  ('assigned',           'in_progress',        'admin'),
  ('assigned',           'cancelled',          'admin'),
  ('in_progress',        'needs_information',  'advisor'),
  ('in_progress',        'under_review',       'advisor'),
  ('in_progress',        'cancelled',          'admin'),
  ('needs_information',  'in_progress',        'advisor'),
  ('needs_information',  'in_progress',        'client'),   -- client supplied the info
  ('needs_information',  'cancelled',          'admin'),
  ('under_review',       'revision_requested', 'reviewer'),
  ('under_review',       'cancelled',          'admin'),
  ('revision_requested', 'cancelled',          'admin'),
  ('under_review',       'completed',          'system'),   -- only by publishing an approved report
  ('revision_requested', 'under_review',       'advisor'),
  ('revision_requested', 'in_progress',        'advisor');

grant select on app.order_transition_rules to authenticated, service_role;

-- Capacities the current user holds on an order.
create or replace function app.order_actor_capacities(p_order uuid) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select array_remove(array[
    case when o.client_id = auth.uid() then 'client' end,
    case when app.is_assigned(o.id, 'advisor') then 'advisor' end,
    case when app.is_assigned(o.id, 'reviewer') then 'reviewer' end,
    case when app.is_branch_admin(o.branch_id) then 'admin' end
  ], null)
  from public.orders o where o.id = p_order
$$;

-- Internal: perform a validated transition as a given actor kind.
create or replace function app._apply_transition(
  p_order uuid, p_to public.order_status, p_actor text, p_reason text
) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders;
  v_from  public.order_status;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  v_from := v_order.status;

  if not exists (
    select 1 from app.order_transition_rules r
    where r.from_status = v_from and r.to_status = p_to and r.actor = p_actor
  ) then
    raise exception 'transition_not_allowed: % -> % by %', v_from, p_to, p_actor
      using errcode = '42501';
  end if;

  update public.orders set
    status        = p_to,
    paid_at       = case when p_to = 'paid' then now() else paid_at end,
    completed_at  = case when p_to = 'completed' then now() else completed_at end,
    cancelled_at  = case when p_to = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_to = 'cancelled' then p_reason else cancel_reason end
  where id = p_order
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  values (p_order, v_from, p_to, auth.uid(), p_reason);

  perform app.audit('order.status_changed', 'order', p_order,
    jsonb_build_object('from', v_from, 'to', p_to, 'actor', p_actor, 'reason', p_reason));
  perform app.emit_event('order.status_changed', 'order', p_order,
    jsonb_build_object('from', v_from, 'to', p_to, 'order_number', v_order.order_number));

  if p_actor <> 'client' then
    perform app.notify(v_order.client_id, 'order.status_changed',
      'Захиалгын төлөв шинэчлэгдлээ',
      v_order.order_number || ': ' || p_to::text,
      '/dashboard/orders/' || p_order::text);
  end if;

  return v_order;
end $$;

-- Public entry point for user-initiated transitions. The caller's capacity on
-- the order decides which rules apply; 'system' transitions are unreachable.
create or replace function app.transition_order(p_order uuid, p_to public.order_status, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_caps   text[];
  v_actor  text;
  v_status public.order_status;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_caps := app.order_actor_capacities(p_order);
  if v_caps is null or cardinality(v_caps) = 0 then
    -- Do not reveal whether the order exists.
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  select status into v_status from public.orders where id = p_order;

  select r.actor into v_actor
  from app.order_transition_rules r
  where r.from_status = v_status and r.to_status = p_to and r.actor = any (v_caps)
  order by array_position(array['admin', 'reviewer', 'advisor', 'client'], r.actor)
  limit 1;

  if v_actor is null then
    raise exception 'transition_not_allowed: % -> %', v_status, p_to using errcode = '42501';
  end if;

  if p_to = 'cancelled' and coalesce(btrim(p_reason), '') = '' and v_actor = 'admin' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Moving back to draft is only possible while no invoice is paid/open.
  if p_to = 'draft' and exists (
    select 1 from public.payments where order_id = p_order and status in ('pending', 'paid')
  ) then
    raise exception 'open_payment_exists' using errcode = '42501';
  end if;

  return app._apply_transition(p_order, p_to, v_actor, p_reason);
end $$;

-- ---------------------------------------------------------------------------
-- Order numbers: MA-YYYY-000123
-- ---------------------------------------------------------------------------
create or replace function app.next_order_number() returns text
language sql volatile security definer set search_path = public, pg_temp as $$
  select 'MA-' || to_char(now() at time zone 'Asia/Ulaanbaatar', 'YYYY') || '-' ||
         lpad(nextval('public.order_number_seq')::text, 6, '0')
$$;

-- ---------------------------------------------------------------------------
-- Pricing: pick the current *approved* price row for a service/segment/value.
-- Returns null when nothing approved matches (order cannot be submitted).
-- ---------------------------------------------------------------------------
create or replace function app.quote_price(p_service uuid, p_segment public.property_type, p_value_mnt bigint)
returns public.service_prices
language sql stable security definer set search_path = public, pg_temp as $$
  select sp.*
  from public.service_prices sp
  where sp.service_id = p_service
    and sp.status = 'approved'
    and sp.effective_from <= now()
    and (sp.effective_to is null or sp.effective_to > now())
    and (sp.segment is null or sp.segment = p_segment)
    and (sp.value_min_mnt is null or (p_value_mnt is not null and p_value_mnt >= sp.value_min_mnt))
    and (sp.value_max_mnt is null or p_value_mnt is null or p_value_mnt < sp.value_max_mnt)
  -- most specific first: segment match beats generic, then the bounded band,
  -- then the newest version
  order by (sp.segment is not null) desc,
           (sp.value_min_mnt is not null or sp.value_max_mnt is not null) desc,
           sp.version desc
  limit 1
$$;

create or replace function app.compute_amount(p_price public.service_prices, p_value_mnt bigint) returns bigint
language sql immutable as $$
  select case p_price.pricing_model
    when 'fixed' then p_price.amount_mnt
    when 'percentage' then greatest(
      coalesce(p_price.min_fee_mnt, 0),
      -- integer arithmetic, round half up to whole tugrik
      ((p_value_mnt * p_price.percent_bps) + 5000) / 10000)
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- Draft orders
-- p_property: {property_type, title, district, khoroo, address, project_name,
--              area_sqm, rooms, floor, total_floors, build_year,
--              registration_number, cadastral_number, asking_price_mnt,
--              listing_url, notes}
-- p_parties:  [{party_role, full_name, phone, email, is_client, notes}]
-- ---------------------------------------------------------------------------
create or replace function app._write_property(p_property_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := p_property_id;
begin
  if v_id is null then
    insert into public.properties (created_by, property_type) values (auth.uid(), (p ->> 'property_type')::public.property_type)
    returning id into v_id;
  end if;

  update public.properties set
    property_type       = (p ->> 'property_type')::public.property_type,
    title               = coalesce(left(p ->> 'title', 200), ''),
    district            = nullif(p ->> 'district', ''),
    khoroo              = nullif(p ->> 'khoroo', ''),
    address             = nullif(p ->> 'address', ''),
    project_name        = nullif(p ->> 'project_name', ''),
    area_sqm            = nullif(p ->> 'area_sqm', '')::numeric,
    rooms               = nullif(p ->> 'rooms', '')::smallint,
    floor               = nullif(p ->> 'floor', '')::smallint,
    total_floors        = nullif(p ->> 'total_floors', '')::smallint,
    build_year          = nullif(p ->> 'build_year', '')::smallint,
    registration_number = nullif(p ->> 'registration_number', ''),
    cadastral_number    = nullif(p ->> 'cadastral_number', ''),
    asking_price_mnt    = nullif(p ->> 'asking_price_mnt', '')::bigint,
    listing_url         = nullif(p ->> 'listing_url', ''),
    notes               = nullif(p ->> 'notes', '')
  where id = v_id;
  return v_id;
end $$;

create or replace function app._write_parties(p_order uuid, p_parties jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_parties is null then return; end if;
  if jsonb_typeof(p_parties) <> 'array' or jsonb_array_length(p_parties) > 10 then
    raise exception 'invalid_parties' using errcode = '22023';
  end if;
  delete from public.order_parties where order_id = p_order;
  insert into public.order_parties (order_id, party_role, full_name, phone, email, is_client, notes)
  select p_order,
         (x ->> 'party_role')::public.party_role,
         btrim(x ->> 'full_name'),
         nullif(x ->> 'phone', ''),
         nullif(x ->> 'email', ''),
         coalesce((x ->> 'is_client')::boolean, false),
         nullif(x ->> 'notes', '')
  from jsonb_array_elements(p_parties) x
  where coalesce(btrim(x ->> 'full_name'), '') <> '';
end $$;

create or replace function app.default_branch_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.branches where status = 'active' order by created_at, code limit 1
$$;

create or replace function app.create_order_draft(
  p_service_code text, p_property jsonb, p_parties jsonb default '[]'::jsonb,
  p_notes text default null, p_branch uuid default null
) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_service public.services;
  v_branch  uuid;
  v_prop    uuid;
  v_order   public.orders;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_service from public.services where code = p_service_code;
  if not found or not v_service.is_orderable then
    raise exception 'service_not_orderable' using errcode = '22023';
  end if;

  v_branch := coalesce(p_branch, app.default_branch_id());
  if not exists (select 1 from public.branches where id = v_branch and status = 'active') then
    raise exception 'branch_not_available' using errcode = '22023';
  end if;

  v_prop := app._write_property(null, p_property);

  insert into public.orders (order_number, client_id, branch_id, service_id, property_id, client_notes)
  values (app.next_order_number(), auth.uid(), v_branch, v_service.id, v_prop, nullif(p_notes, ''))
  returning * into v_order;

  perform app._write_parties(v_order.id, p_parties);

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  values (v_order.id, null, 'draft', auth.uid(), 'created');
  perform app.audit('order.created', 'order', v_order.id, jsonb_build_object('service', v_service.code));
  perform app.emit_event('order.created', 'order', v_order.id,
    jsonb_build_object('order_number', v_order.order_number, 'service', v_service.code));
  return v_order;
end $$;

create or replace function app.update_order_draft(
  p_order uuid, p_property jsonb, p_parties jsonb default null, p_notes text default null
) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found or v_order.client_id is distinct from auth.uid() then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'draft' then
    raise exception 'order_not_editable' using errcode = '42501';
  end if;

  perform app._write_property(v_order.property_id, p_property);
  perform app._write_parties(p_order, p_parties);
  update public.orders set client_notes = nullif(p_notes, '') where id = p_order returning * into v_order;
  perform app.audit('order.draft_updated', 'order', p_order, '{}'::jsonb);
  return v_order;
end $$;

-- Submit a draft: freeze price + terms, record consent, move to awaiting_payment.
create or replace function app.submit_order(
  p_order uuid, p_accept_terms boolean, p_ip inet default null, p_user_agent text default null
) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order   public.orders;
  v_service public.services;
  v_prop    public.properties;
  v_price   public.service_prices;
  v_amount  bigint;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found or v_order.client_id is distinct from auth.uid() then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'draft' then
    raise exception 'order_not_editable' using errcode = '42501';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'terms_not_accepted' using errcode = '22023';
  end if;

  select * into v_service from public.services where id = v_order.service_id;
  if not v_service.is_orderable then
    raise exception 'service_not_orderable' using errcode = '22023';
  end if;
  select * into v_prop from public.properties where id = v_order.property_id;
  if v_prop.id is null then
    raise exception 'property_required' using errcode = '22023';
  end if;

  v_price := app.quote_price(v_service.id, v_prop.property_type, v_prop.asking_price_mnt);
  if v_price.id is null then
    raise exception 'price_not_configured' using errcode = '22023';
  end if;
  v_amount := app.compute_amount(v_price, v_prop.asking_price_mnt);
  if v_amount is null or v_amount <= 0 then
    raise exception 'price_requires_quote' using errcode = '22023';
  end if;

  update public.orders set
    service_price_id = v_price.id,
    amount_mnt       = v_amount,
    price_snapshot   = jsonb_build_object(
      'service_code', v_service.code,
      'service_name', v_service.name,
      'price_id', v_price.id,
      'price_version', v_price.version,
      'pricing_model', v_price.pricing_model,
      'segment', v_price.segment,
      'value_min_mnt', v_price.value_min_mnt,
      'value_max_mnt', v_price.value_max_mnt,
      'percent_bps', v_price.percent_bps,
      'label', v_price.label,
      'amount_mnt', v_amount,
      'vat_included', true,
      'captured_at', now()),
    terms_version    = v_service.terms_version,
    terms_snapshot   = v_service.terms_text,
    submitted_at     = now()
  where id = p_order;

  insert into public.consents (user_id, order_id, consent_type, version, text_sha256, ip_address, user_agent)
  values (auth.uid(), p_order, 'service_terms', v_service.terms_version,
          encode(digest(v_service.terms_text, 'sha256'), 'hex'), p_ip, left(p_user_agent, 500));

  return app._apply_transition(p_order, 'awaiting_payment', 'client', 'submitted');
end $$;

-- ---------------------------------------------------------------------------
-- Assignment (branch admins / super admins only)
-- ---------------------------------------------------------------------------
create or replace function app.assign_order(p_order uuid, p_user uuid, p_role public.assignment_role)
returns public.order_assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order  public.orders;
  v_needed public.app_role;
  v_row    public.order_assignments;
  v_other  uuid;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found or not app.is_branch_admin(v_order.branch_id) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status in ('draft', 'awaiting_payment', 'completed', 'cancelled') then
    raise exception 'order_not_assignable_in_status: %', v_order.status using errcode = '42501';
  end if;

  v_needed := case p_role when 'advisor' then 'ADVISOR' else 'REVIEWER' end;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = p_user and m.is_active and m.branch_id = v_order.branch_id and m.role = v_needed
  ) then
    raise exception 'assignee_lacks_role' using errcode = '42501';
  end if;

  -- Four-eyes rule: the reviewer can never be the advisor on the same order.
  select user_id into v_other from public.order_assignments
  where order_id = p_order and is_active and role <> p_role;
  if v_other = p_user then
    raise exception 'reviewer_must_differ_from_advisor' using errcode = '42501';
  end if;

  update public.order_assignments set is_active = false, unassigned_at = now()
  where order_id = p_order and role = p_role and is_active;

  insert into public.order_assignments (order_id, user_id, role, assigned_by)
  values (p_order, p_user, p_role, auth.uid())
  returning * into v_row;

  perform app.audit('order.assigned', 'order', p_order, jsonb_build_object('user', p_user, 'role', p_role));
  perform app.notify(p_user, 'order.assigned', 'Танд захиалга хуваарилагдлаа',
    v_order.order_number, '/admin/orders/' || p_order::text);

  if p_role = 'advisor' and v_order.status = 'paid' then
    perform app._apply_transition(p_order, 'assigned', 'admin', 'advisor assigned');
  end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Payment confirmation (server-side only, after the provider verified it).
-- Idempotent: confirming an already-paid payment is a no-op.
-- ---------------------------------------------------------------------------
create or replace function app.confirm_payment(p_payment uuid, p_provider_payment_id text)
returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pay   public.payments;
  v_order public.orders;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_pay.status = 'paid' then
    return v_pay;                        -- idempotent replay
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'payment_not_pending: %', v_pay.status using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = v_pay.order_id for update;
  if v_pay.amount_mnt <> v_order.amount_mnt then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;

  update public.payments set status = 'paid', paid_at = now(), provider_payment_id = p_provider_payment_id
  where id = p_payment returning * into v_pay;

  if v_order.status = 'awaiting_payment' then
    perform app._apply_transition(v_order.id, 'paid', 'system', 'payment ' || v_pay.id::text);
  end if;
  perform app.audit('payment.paid', 'payment', v_pay.id, jsonb_build_object('order', v_order.id, 'amount_mnt', v_pay.amount_mnt));
  perform app.emit_event('payment.paid', 'payment', v_pay.id,
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'amount_mnt', v_pay.amount_mnt));
  return v_pay;
end $$;

-- ---------------------------------------------------------------------------
-- Price list maintenance (super admin). A price referenced by any order is
-- immutable: changes create a new version and retire the old row.
-- ---------------------------------------------------------------------------
create or replace function app.guard_service_price_update() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.orders where service_price_id = old.id)
     and (new.amount_mnt, new.percent_bps, new.pricing_model, new.segment, new.value_min_mnt, new.value_max_mnt, new.min_fee_mnt)
         is distinct from
         (old.amount_mnt, old.percent_bps, old.pricing_model, old.segment, old.value_min_mnt, old.value_max_mnt, old.min_fee_mnt)
  then
    raise exception 'price_in_use_create_new_version' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger service_prices_guard before update on public.service_prices
  for each row execute function app.guard_service_price_update();

create or replace function app.revise_service_price(
  p_price uuid, p_amount_mnt bigint, p_percent_bps int default null, p_status public.price_status default null
) returns public.service_prices
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old public.service_prices;
  v_new public.service_prices;
begin
  if not app.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_old from public.service_prices where id = p_price for update;
  if not found or v_old.effective_to is not null then
    raise exception 'price_not_found' using errcode = 'P0002';
  end if;

  update public.service_prices set effective_to = now(), status = 'retired' where id = p_price;

  insert into public.service_prices (
    service_id, version, segment, value_min_mnt, value_max_mnt, pricing_model,
    amount_mnt, percent_bps, min_fee_mnt, label, status, created_by)
  values (
    v_old.service_id,
    (select coalesce(max(version), 0) + 1 from public.service_prices where service_id = v_old.service_id),
    v_old.segment, v_old.value_min_mnt, v_old.value_max_mnt, v_old.pricing_model,
    coalesce(p_amount_mnt, v_old.amount_mnt), coalesce(p_percent_bps, v_old.percent_bps), v_old.min_fee_mnt,
    v_old.label, coalesce(p_status, v_old.status), auth.uid())
  returning * into v_new;

  perform app.audit('price.revised', 'service_price', v_new.id,
    jsonb_build_object('previous', v_old.id, 'old_amount', v_old.amount_mnt, 'new_amount', v_new.amount_mnt,
                       'old_status', v_old.status, 'new_status', v_new.status));
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Role management
-- ---------------------------------------------------------------------------
create or replace function app.grant_role(p_user uuid, p_role public.app_role, p_branch uuid default null)
returns public.memberships
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.memberships;
begin
  -- Super admin may grant anything. Branch admins may add ADVISOR/REVIEWER to their branch.
  if not (app.is_super_admin()
          or (p_role in ('ADVISOR', 'REVIEWER') and p_branch is not null
              and app.has_branch_role(p_branch, array['BRANCH_ADMIN']::public.app_role[]))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.memberships (user_id, role, branch_id, created_by)
  values (p_user, p_role, p_branch, auth.uid())
  on conflict (user_id, role, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set is_active = true
  returning * into v_row;

  perform app.audit('membership.granted', 'profile', p_user, jsonb_build_object('role', p_role, 'branch', p_branch));
  return v_row;
end $$;

create or replace function app.revoke_role(p_membership uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.memberships;
begin
  select * into v_row from public.memberships where id = p_membership for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (app.is_super_admin()
          or (v_row.role in ('ADVISOR', 'REVIEWER')
              and app.has_branch_role(v_row.branch_id, array['BRANCH_ADMIN']::public.app_role[]))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_row.user_id = auth.uid() and v_row.role = 'SUPER_ADMIN' then
    raise exception 'cannot_revoke_own_super_admin' using errcode = '42501';
  end if;
  update public.memberships set is_active = false where id = p_membership;
  perform app.audit('membership.revoked', 'profile', v_row.user_id, jsonb_build_object('role', v_row.role, 'branch', v_row.branch_id));
end $$;

-- ---------------------------------------------------------------------------
-- Execute grants
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema app from public;

grant execute on function
  app.uid(), app.is_super_admin(), app.has_branch_role(uuid, public.app_role[]),
  app.is_branch_admin(uuid), app.is_staff(), app.is_assigned(uuid, public.assignment_role),
  app.can_view_order(uuid), app.can_work_order(uuid), app.can_view_profile(uuid),
  app.order_actor_capacities(uuid),
  app.transition_order(uuid, public.order_status, text),
  app.create_order_draft(text, jsonb, jsonb, text, uuid),
  app.update_order_draft(uuid, jsonb, jsonb, text),
  app.submit_order(uuid, boolean, inet, text),
  app.assign_order(uuid, uuid, public.assignment_role),
  app.revise_service_price(uuid, bigint, int, public.price_status),
  app.grant_role(uuid, public.app_role, uuid),
  app.revoke_role(uuid),
  app.quote_price(uuid, public.property_type, bigint),
  app.compute_amount(public.service_prices, bigint)
to authenticated;

-- RLS policies on public tables call these for anon visitors too.
grant execute on function app.is_staff(), app.is_super_admin() to anon;

-- Payment confirmation and raw writers are server-only (service_role / owner).
grant execute on all functions in schema app to service_role;

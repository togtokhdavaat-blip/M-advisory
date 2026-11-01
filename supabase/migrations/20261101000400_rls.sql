-- ============================================================================
-- Row Level Security
-- Tables are owned by the migration role; SECURITY DEFINER functions run as
-- that owner and therefore bypass RLS (RLS is enabled, not forced).
-- Default deny: revoke everything from anon/authenticated, enable RLS on every
-- table, then grant the minimum and add policies. Mutations on workflow tables
-- go through app.* SECURITY DEFINER functions, so there are no INSERT/UPDATE
-- grants for them at all.
-- ============================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public catalogue (anon + authenticated)
-- ---------------------------------------------------------------------------
grant select on public.services, public.service_prices, public.service_requirements, public.branches to anon, authenticated;

create policy services_public_read on public.services for select to anon, authenticated
  using (is_active or app.is_staff());

create policy service_prices_public_read on public.service_prices for select to anon, authenticated
  using (
    (status = 'approved' and effective_to is null
      and exists (select 1 from public.services s where s.id = service_id and s.is_active))
    or app.is_super_admin()
  );

create policy service_requirements_public_read on public.service_requirements for select to anon, authenticated
  using (exists (select 1 from public.services s where s.id = service_id and (s.is_active or app.is_staff())));

create policy branches_read on public.branches for select to anon, authenticated
  using (status = 'active' or app.is_super_admin());

-- Super admin edits catalogue content directly (prices go through a function).
grant update (name, tagline, description, deliverable, scope_items, excluded_items, turnaround_text,
              is_active, is_orderable, sort_order, terms_version, terms_text)
  on public.services to authenticated;
create policy services_admin_update on public.services for update to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

grant insert on public.service_prices to authenticated;
grant update (status) on public.service_prices to authenticated;
create policy service_prices_admin_insert on public.service_prices for insert to authenticated
  with check (app.is_super_admin());
create policy service_prices_admin_update on public.service_prices for update to authenticated
  using (app.is_super_admin() and effective_to is null) with check (app.is_super_admin());

grant insert, update, delete on public.service_requirements to authenticated;
create policy service_requirements_admin_write on public.service_requirements for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

grant insert, update (name, address, phone, status) on public.branches to authenticated;
create policy branches_admin_insert on public.branches for insert to authenticated
  with check (app.is_super_admin());
create policy branches_admin_update on public.branches for update to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ---------------------------------------------------------------------------
-- Profiles & memberships
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone, locale) on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (app.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

grant select on public.memberships to authenticated;
create policy memberships_read on public.memberships for select to authenticated
  using (
    user_id = auth.uid()
    or app.is_super_admin()
    or (branch_id is not null and app.has_branch_role(branch_id, array['BRANCH_ADMIN']::public.app_role[]))
  );

-- ---------------------------------------------------------------------------
-- Properties & orders (read-only for app roles; writes via app.* functions)
-- ---------------------------------------------------------------------------
grant select on public.properties, public.orders, public.order_parties, public.order_assignments,
                public.order_status_history to authenticated;

create policy properties_read on public.properties for select to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.orders o where o.property_id = properties.id and app.can_view_order(o.id))
  );

create policy orders_read on public.orders for select to authenticated
  using (app.can_view_order(id));

create policy order_parties_read on public.order_parties for select to authenticated
  using (app.can_view_order(order_id));

create policy order_assignments_read on public.order_assignments for select to authenticated
  using (app.can_view_order(order_id));

create policy order_status_history_read on public.order_status_history for select to authenticated
  using (app.can_view_order(order_id));

grant select, insert on public.order_feedback to authenticated;
create policy order_feedback_read on public.order_feedback for select to authenticated
  using (app.can_view_order(order_id));
create policy order_feedback_insert on public.order_feedback for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (select 1 from public.orders o where o.id = order_id and o.client_id = auth.uid() and o.status = 'completed')
  );

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
grant select on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (app.can_view_order(order_id));

grant select on public.payment_events to authenticated;
create policy payment_events_admin_read on public.payment_events for select to authenticated
  using (
    app.is_super_admin()
    or exists (select 1 from public.payments p join public.orders o on o.id = p.order_id
               where p.id = payment_id and app.is_branch_admin(o.branch_id))
  );

-- ---------------------------------------------------------------------------
-- Documents — client sees non-internal files on own orders; staff see all on
-- orders they work. Upload metadata row is written by the server after the
-- file passed validation; the policy re-checks access anyway.
-- ---------------------------------------------------------------------------
grant select, insert on public.documents to authenticated;
grant update (deleted_at) on public.documents to authenticated;

create policy documents_read on public.documents for select to authenticated
  using (
    deleted_at is null and (
      app.can_work_order(order_id)
      or (not is_internal and exists (select 1 from public.orders o where o.id = order_id and o.client_id = auth.uid()))
    )
  );

create policy documents_insert on public.documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and scan_status = 'pending'
    and (
      app.can_work_order(order_id)
      or (not is_internal and exists (
            select 1 from public.orders o
            where o.id = order_id and o.client_id = auth.uid()
              and o.status not in ('completed', 'cancelled')))
    )
  );

create policy documents_soft_delete on public.documents for update to authenticated
  using (uploaded_by = auth.uid() or app.can_work_order(order_id))
  with check (uploaded_by = auth.uid() or app.can_work_order(order_id));

-- ---------------------------------------------------------------------------
-- Reports — client sees published versions only.
-- ---------------------------------------------------------------------------
grant select on public.reports, public.report_reviews to authenticated;

create policy reports_read on public.reports for select to authenticated
  using (
    app.can_work_order(order_id)
    or (status = 'published' and exists (select 1 from public.orders o where o.id = order_id and o.client_id = auth.uid()))
  );

create policy report_reviews_read on public.report_reviews for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and app.can_work_order(r.order_id)));

-- ---------------------------------------------------------------------------
-- Notifications & consents
-- ---------------------------------------------------------------------------
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert on public.consents to authenticated;
grant update (withdrawn_at) on public.consents to authenticated;
create policy consents_own_read on public.consents for select to authenticated
  using (user_id = auth.uid() or app.is_super_admin());
create policy consents_own_insert on public.consents for insert to authenticated
  with check (user_id = auth.uid());
create policy consents_own_withdraw on public.consents for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Audit log (super admin read-only; append happens in app.audit)
-- integration_events: no app-role access at all.
-- ---------------------------------------------------------------------------
grant select on public.audit_logs to authenticated;
create policy audit_logs_super_admin_read on public.audit_logs for select to authenticated
  using (app.is_super_admin());

-- service_role (server, webhooks, jobs) keeps full access; it bypasses RLS.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

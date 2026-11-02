-- ============================================================================
-- Report lifecycle, refunds, document processing and e-mail delivery queue.
-- Report: draft -> submitted -> (revision_requested | approved) -> published
-- Only an approved version can be published, and publishing is the only way
-- an order reaches 'completed'.
-- ============================================================================

alter table public.notifications add column if not exists emailed_at timestamptz;
alter table public.notifications add column if not exists email_error text;
create index if not exists notifications_email_queue_idx on public.notifications (created_at) where emailed_at is null;

-- Overall risk is derived, never typed in: high > medium > not_verified > low.
-- "not_verified" is never silently turned into "low".
create or replace function app.overall_risk(p_content jsonb) returns public.risk_level
language sql immutable as $$
  with levels as (
    select x ->> 'level' as level from jsonb_array_elements(coalesce(p_content -> 'risks', '[]'::jsonb)) x
  )
  select case
    when exists (select 1 from levels where level = 'high') then 'high'
    when exists (select 1 from levels where level = 'medium') then 'medium'
    when exists (select 1 from levels where level = 'not_verified') then 'not_verified'
    when exists (select 1 from levels where level = 'low') then 'low'
    else 'not_verified'
  end::public.risk_level
$$;

-- Create or update the advisor's working draft. A new version is started
-- after a revision request; submitted/approved versions are frozen.
create or replace function app.save_report_draft(p_order uuid, p_content jsonb) returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order  public.orders;
  v_latest public.reports;
  v_row    public.reports;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found or not app.is_assigned(p_order, 'advisor') then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('assigned', 'in_progress', 'needs_information', 'revision_requested') then
    raise exception 'report_not_editable_in_status: %', v_order.status using errcode = '42501';
  end if;
  if jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 500000 then
    raise exception 'invalid_report_content' using errcode = '22023';
  end if;

  select * into v_latest from public.reports where order_id = p_order order by version desc limit 1 for update;

  if v_latest.id is not null and v_latest.status = 'draft' then
    update public.reports set content = p_content, overall_risk = app.overall_risk(p_content)
    where id = v_latest.id returning * into v_row;
  elsif v_latest.id is null or v_latest.status = 'revision_requested' then
    insert into public.reports (order_id, report_number, version, status, content, overall_risk, prepared_by)
    values (p_order, v_order.order_number || '-R', coalesce(v_latest.version, 0) + 1, 'draft',
            p_content, app.overall_risk(p_content), auth.uid())
    returning * into v_row;
  else
    raise exception 'report_locked: %', v_latest.status using errcode = '42501';
  end if;

  if v_order.status = 'assigned' then
    perform app._apply_transition(p_order, 'in_progress', 'advisor', 'report started');
  end if;
  return v_row;
end $$;

create or replace function app.submit_report(p_report uuid) returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rep   public.reports;
  v_order public.orders;
  v_rev   uuid;
begin
  select * into v_rep from public.reports where id = p_report for update;
  if not found or not app.is_assigned(v_rep.order_id, 'advisor') then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if v_rep.status <> 'draft' then
    raise exception 'report_not_draft' using errcode = '42501';
  end if;
  if coalesce(btrim(v_rep.content ->> 'executive_summary'), '') = ''
     or coalesce(btrim(v_rep.content ->> 'limitations'), '') = ''
     or coalesce(btrim(v_rep.content ->> 'recommendations'), '') = ''
     or jsonb_array_length(coalesce(v_rep.content -> 'risks', '[]'::jsonb)) = 0 then
    raise exception 'report_incomplete' using errcode = '22023';
  end if;
  select user_id into v_rev from public.order_assignments where order_id = v_rep.order_id and role = 'reviewer' and is_active;
  if v_rev is null then
    raise exception 'reviewer_not_assigned' using errcode = '42501';
  end if;

  update public.reports set status = 'submitted', submitted_at = now(), overall_risk = app.overall_risk(content)
  where id = p_report returning * into v_rep;

  select * into v_order from public.orders where id = v_rep.order_id;
  if v_order.status in ('in_progress', 'revision_requested') then
    perform app._apply_transition(v_order.id, 'under_review', 'advisor', 'report v' || v_rep.version || ' submitted');
  end if;
  perform app.audit('report.submitted', 'report', p_report, jsonb_build_object('version', v_rep.version));
  perform app.notify(v_rev, 'report.submitted', 'Тайлан хянуулахаар ирлээ', v_order.order_number, '/admin/orders/' || v_order.id || '/report');
  return v_rep;
end $$;

create or replace function app.review_report(p_report uuid, p_decision public.review_decision, p_comments text)
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rep   public.reports;
  v_order public.orders;
begin
  select * into v_rep from public.reports where id = p_report for update;
  if not found or not app.is_assigned(v_rep.order_id, 'reviewer') then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if v_rep.status <> 'submitted' then
    raise exception 'report_not_submitted' using errcode = '42501';
  end if;
  if v_rep.prepared_by = auth.uid() then
    raise exception 'reviewer_must_differ_from_advisor' using errcode = '42501';
  end if;
  if p_decision = 'revision_requested' and coalesce(btrim(p_comments), '') = '' then
    raise exception 'comments_required' using errcode = '22023';
  end if;

  insert into public.report_reviews (report_id, reviewer_id, decision, comments)
  values (p_report, auth.uid(), p_decision, nullif(btrim(p_comments), ''));

  select * into v_order from public.orders where id = v_rep.order_id;
  if p_decision = 'approved' then
    update public.reports set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_report returning * into v_rep;
  else
    update public.reports set status = 'revision_requested' where id = p_report returning * into v_rep;
    perform app._apply_transition(v_order.id, 'revision_requested', 'reviewer', left(p_comments, 500));
    perform app.notify(v_rep.prepared_by, 'report.revision_requested', 'Тайланд засвар хүслээ', v_order.order_number,
                       '/admin/orders/' || v_order.id || '/report');
  end if;
  perform app.audit('report.reviewed', 'report', p_report, jsonb_build_object('decision', p_decision));
  return v_rep;
end $$;

-- Called by the server after it rendered and stored the PDF of the approved version.
create or replace function app.publish_report(p_report uuid, p_file_path text, p_file_sha256 text)
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rep   public.reports;
  v_order public.orders;
begin
  select * into v_rep from public.reports where id = p_report for update;
  if not found or not (app.is_assigned(v_rep.order_id, 'reviewer')
                       or app.is_branch_admin((select branch_id from public.orders where id = v_rep.order_id))) then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if v_rep.status <> 'approved' then
    raise exception 'report_not_approved' using errcode = '42501';
  end if;
  if coalesce(p_file_path, '') = '' or p_file_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'report_file_required' using errcode = '22023';
  end if;

  update public.reports set status = 'published', published_at = now(), file_path = p_file_path, file_sha256 = p_file_sha256
  where id = p_report returning * into v_rep;

  select * into v_order from public.orders where id = v_rep.order_id for update;
  if v_order.status = 'under_review' then
    perform app._apply_transition(v_order.id, 'completed', 'system', 'report v' || v_rep.version || ' published');
  end if;
  perform app.audit('report.published', 'report', p_report, jsonb_build_object('version', v_rep.version, 'sha256', p_file_sha256));
  perform app.emit_event('report.published', 'report', p_report,
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'version', v_rep.version));
  perform app.notify(v_order.client_id, 'report.published', 'Таны тайлан бэлэн боллоо',
    v_order.order_number || ' захиалгын тайланг самбараасаа татаж авна уу.', '/dashboard/orders/' || v_order.id);
  return v_rep;
end $$;

-- Client tells the advisor the requested information has been provided.
create or replace function app.client_info_provided(p_order uuid, p_note text) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders; v_adv uuid;
begin
  select * into v_order from public.orders where id = p_order;
  if not found or v_order.client_id is distinct from auth.uid() then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  v_order := app._apply_transition(p_order, 'in_progress', 'client', coalesce(nullif(left(btrim(p_note), 500), ''), 'information provided'));
  select user_id into v_adv from public.order_assignments where order_id = p_order and role = 'advisor' and is_active;
  if v_adv is not null then
    perform app.notify(v_adv, 'order.info_provided', 'Харилцагч мэдээлэл илгээлээ', v_order.order_number, '/admin/orders/' || p_order);
  end if;
  return v_order;
end $$;

-- Refunds are paid out manually by the bank/QPay; admins record each step.
create or replace function app.record_refund(p_payment uuid, p_status public.payment_status, p_amount_mnt bigint, p_note text)
returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pay public.payments; v_order public.orders;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  select * into v_order from public.orders where id = v_pay.order_id;
  if not app.is_branch_admin(v_order.branch_id) then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if v_order.status <> 'cancelled' then raise exception 'order_must_be_cancelled' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;

  if p_status = 'refund_pending' and v_pay.status = 'paid' then
    update public.payments set status = 'refund_pending' where id = p_payment returning * into v_pay;
  elsif p_status = 'refunded' and v_pay.status in ('paid', 'refund_pending') then
    if p_amount_mnt is null or p_amount_mnt <= 0 or p_amount_mnt > v_pay.amount_mnt then
      raise exception 'invalid_refund_amount' using errcode = '22023';
    end if;
    update public.payments set status = 'refunded', refunded_amount_mnt = p_amount_mnt where id = p_payment returning * into v_pay;
    perform app.notify(v_order.client_id, 'payment.refunded', 'Төлбөр буцаагдлаа', v_order.order_number, '/dashboard/orders/' || v_order.id);
  else
    raise exception 'invalid_refund_transition: % -> %', v_pay.status, p_status using errcode = '42501';
  end if;
  perform app.audit('payment.' || p_status, 'payment', p_payment, jsonb_build_object('amount_mnt', p_amount_mnt, 'note', p_note));
  perform app.emit_event('payment.' || p_status, 'payment', p_payment, jsonb_build_object('order_id', v_order.id, 'amount_mnt', p_amount_mnt));
  return v_pay;
end $$;

-- Advisors attach the client-visible request text when asking for information.
create or replace function app.request_information(p_order uuid, p_message text) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders;
begin
  if coalesce(btrim(p_message), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  -- transition_order notifies the client; the message is shown on the order page.
  return app.transition_order(p_order, 'needs_information', left(btrim(p_message), 1000));
end $$;

revoke execute on function app.overall_risk(jsonb), app.save_report_draft(uuid, jsonb), app.submit_report(uuid),
  app.review_report(uuid, public.review_decision, text), app.publish_report(uuid, text, text),
  app.client_info_provided(uuid, text), app.record_refund(uuid, public.payment_status, bigint, text),
  app.request_information(uuid, text) from public;
grant execute on function app.overall_risk(jsonb), app.save_report_draft(uuid, jsonb), app.submit_report(uuid),
  app.review_report(uuid, public.review_decision, text), app.publish_report(uuid, text, text),
  app.client_info_provided(uuid, text), app.record_refund(uuid, public.payment_status, bigint, text),
  app.request_information(uuid, text) to authenticated, service_role;

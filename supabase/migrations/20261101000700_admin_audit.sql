-- ============================================================================
-- Admin helpers + automatic audit of catalogue/branch/price changes.
-- ============================================================================

-- Admins need to add staff who are not yet in their branch. Only admins may
-- resolve an email to a user id; nobody else can probe for accounts.
create or replace function app.find_user_id_by_email(p_email text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (app.is_super_admin() or exists (
    select 1 from public.memberships where user_id = auth.uid() and role = 'BRANCH_ADMIN' and is_active)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select id from public.profiles where lower(email) = lower(btrim(p_email)) limit 1);
end $$;

revoke execute on function app.find_user_id_by_email(text) from public;
grant execute on function app.find_user_id_by_email(text) to authenticated, service_role;

-- Generic row-change audit for configuration tables.
create or replace function app.audit_row_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changed jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k)), '{}'::jsonb)
      into v_changed
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at') and (v_old -> k) is distinct from (v_new -> k);
    if v_changed = '{}'::jsonb then return new; end if;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name,
          coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
          case tg_op when 'UPDATE' then jsonb_build_object('changed', v_changed)
                     when 'INSERT' then jsonb_build_object('row', v_new)
                     else jsonb_build_object('row', v_old) end);
  return coalesce(new, old);
end $$;

create trigger services_audit after insert or update or delete on public.services
  for each row execute function app.audit_row_change();
create trigger service_requirements_audit after insert or update or delete on public.service_requirements
  for each row execute function app.audit_row_change();
create trigger branches_audit after insert or update or delete on public.branches
  for each row execute function app.audit_row_change();
create trigger service_prices_audit after insert or update on public.service_prices
  for each row execute function app.audit_row_change();

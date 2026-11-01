-- ============================================================================
-- Private storage buckets (Supabase only; skipped on plain PostgreSQL).
-- No storage.objects policies are created for anon/authenticated: every
-- upload and download goes through the server, which checks order access,
-- validates type/size, and issues short-lived signed URLs.
-- ============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('order-documents', 'order-documents', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic']),
      ('reports', 'reports', false, 20971520, array['application/pdf'])
    on conflict (id) do update set public = false;
  end if;
end $$;

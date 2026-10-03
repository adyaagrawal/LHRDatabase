-- ═══════════════════════════════════════════════════════════════════════════
-- BUSSY v2 · 04 · Storage buckets + policies
--   receipts/<user-id>/<file>   private: owner + admins read
--   esl-exports/<season>/<file> admins only
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 10485760,
   array['image/png','image/jpeg','image/webp','image/heic','image/heif','image/gif','application/pdf']),
  ('esl-exports', 'esl-exports', false, 20971520,
   array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv'])
on conflict (id) do nothing;

create policy "receipts: approved upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_approved()
  );

create policy "receipts: owner or admin read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "receipts: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

create policy "esl-exports: admin all"
  on storage.objects for all to authenticated
  using (bucket_id = 'esl-exports' and public.is_admin())
  with check (bucket_id = 'esl-exports' and public.is_admin());

-- Reemplazar la foto (upsert) requiere permiso de lectura sobre la propia carpeta
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

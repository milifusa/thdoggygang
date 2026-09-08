insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('dog-photos', 'dog-photos', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('payment-receipts', 'payment-receipts', false, 10485760, array['image/jpeg','image/png','application/pdf']),
  ('signed-waivers', 'signed-waivers', false, 10485760, array['application/pdf','image/png']),
  ('hike-originals', 'hike-originals', false, 52428800, array['image/jpeg','image/png','image/webp']),
  ('hike-previews', 'hike-previews', false, 10485760, array['image/jpeg','image/webp']),
  ('hike-watermarked', 'hike-watermarked', false, 10485760, array['image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy dog_photos_owner_read on storage.objects for select using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = public.current_profile_id()::text);
create policy dog_photos_owner_write on storage.objects for insert with check (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = public.current_profile_id()::text);
create policy receipts_owner_write on storage.objects for insert with check (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = public.current_profile_id()::text);
create policy receipts_owner_read on storage.objects for select using (bucket_id = 'payment-receipts' and ((storage.foldername(name))[1] = public.current_profile_id()::text or public.current_role() = 'ADMIN'));
create policy waivers_owner_read on storage.objects for select using (bucket_id = 'signed-waivers' and ((storage.foldername(name))[1] = public.current_profile_id()::text or public.current_role() = 'ADMIN'));
create policy gallery_staff_write on storage.objects for insert with check (bucket_id in ('hike-originals','hike-previews','hike-watermarked') and public.current_role() = 'ADMIN');
create policy gallery_controlled_read on storage.objects for select using (bucket_id in ('hike-previews','hike-watermarked') and auth.uid() is not null);

-- Per-hike photo administration and safe public previews.
alter table public.photos
  add column if not exists title text,
  add column if not exists caption text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists deleted_at timestamptz;

create index if not exists photos_gallery_active_idx
  on public.photos (gallery_id, sort_order, created_at)
  where deleted_at is null;

alter table public.photo_purchases
  add constraint photo_purchases_order_item_unique unique (order_item_id);

update storage.buckets
set public = true
where id in ('hike-previews', 'hike-watermarked');

drop policy if exists gallery_controlled_read on storage.objects;
drop policy if exists gallery_public_preview_read on storage.objects;
create policy gallery_public_preview_read on storage.objects
for select using (bucket_id in ('hike-previews','hike-watermarked'));

drop policy if exists gallery_staff_update on storage.objects;
create policy gallery_staff_update on storage.objects
for update using (bucket_id in ('hike-originals','hike-previews','hike-watermarked') and public.current_role() = 'ADMIN')
with check (bucket_id in ('hike-originals','hike-previews','hike-watermarked') and public.current_role() = 'ADMIN');

drop policy if exists gallery_staff_delete on storage.objects;
create policy gallery_staff_delete on storage.objects
for delete using (bucket_id in ('hike-originals','hike-previews','hike-watermarked') and public.current_role() = 'ADMIN');

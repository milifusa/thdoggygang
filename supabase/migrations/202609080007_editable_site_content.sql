-- Editable per-hike story headings and landing page content.
alter table public.hikes
  add column if not exists story_title text not null default E'Respira bosque.\nCamina en manada.';

create table if not exists public.site_content (
  id text primary key check (id = 'landing'),
  content jsonb not null default '{}'::jsonb,
  hero_image_path text,
  how_image_path text,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read on public.site_content for select using (true);
drop policy if exists site_content_admin_write on public.site_content;
create policy site_content_admin_write on public.site_content for all
  using (public.current_role() = 'ADMIN')
  with check (public.current_role() = 'ADMIN');

insert into public.site_content (id) values ('landing') on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_assets_public_read on storage.objects;
create policy site_assets_public_read on storage.objects for select using (bucket_id = 'site-assets');
drop policy if exists site_assets_admin_insert on storage.objects;
create policy site_assets_admin_insert on storage.objects for insert
  with check (bucket_id = 'site-assets' and public.current_role() = 'ADMIN');
drop policy if exists site_assets_admin_update on storage.objects;
create policy site_assets_admin_update on storage.objects for update
  using (bucket_id = 'site-assets' and public.current_role() = 'ADMIN')
  with check (bucket_id = 'site-assets' and public.current_role() = 'ADMIN');
drop policy if exists site_assets_admin_delete on storage.objects;
create policy site_assets_admin_delete on storage.objects for delete
  using (bucket_id = 'site-assets' and public.current_role() = 'ADMIN');

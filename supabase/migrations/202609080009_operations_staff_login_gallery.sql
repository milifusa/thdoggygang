-- Operations center, staff management, private customer galleries and login CMS.
alter table public.profiles
  add column if not exists active boolean not null default true;

alter table public.hikes add column if not exists cancelled_at timestamptz;

alter table public.hike_galleries
  add column if not exists default_photo_price_cents integer not null default 9000 check (default_photo_price_cents >= 0),
  add column if not exists package_5_price_cents integer check (package_5_price_cents is null or package_5_price_cents >= 0),
  add column if not exists package_10_price_cents integer check (package_10_price_cents is null or package_10_price_cents >= 0),
  add column if not exists full_gallery_price_cents integer check (full_gallery_price_cents is null or full_gallery_price_cents >= 0),
  add column if not exists cover_photo_id uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.photos
  add column if not exists processing_status text not null default 'READY'
    check (processing_status in ('UPLOADING','PROCESSING','READY','ERROR')),
  add column if not exists hidden boolean not null default false;

do $$ begin
  alter table public.hike_galleries
    add constraint hike_galleries_cover_photo_fk foreign key (cover_photo_id) references public.photos(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists public.photo_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, photo_id)
);
alter table public.photo_favorites enable row level security;
create policy photo_favorites_owner on public.photo_favorites for all
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- Published galleries are exclusive to attendees and staff.
drop policy if exists galleries_visible on public.hike_galleries;
create policy galleries_attendee_read on public.hike_galleries for select using (
  public.current_role() = 'ADMIN'
  or public.can_operate_hike(hike_id)
  or (
    published_at is not null and exists (
      select 1 from public.bookings b
      where b.hike_id = hike_id
        and b.profile_id = public.current_profile_id()
        and b.status in ('CONFIRMED','COMPLETED')
    )
  )
);

drop policy if exists photos_visible on public.photos;
create policy photos_attendee_read on public.photos for select using (
  not hidden and exists (
    select 1 from public.hike_galleries g
    where g.id = gallery_id and (
      public.current_role() = 'ADMIN'
      or public.can_operate_hike(g.hike_id)
      or (g.published_at is not null and exists (
        select 1 from public.bookings b
        where b.hike_id = g.hike_id
          and b.profile_id = public.current_profile_id()
          and b.status in ('CONFIRMED','COMPLETED')
      ))
    )
  )
);

drop policy if exists gallery_public_preview_read on storage.objects;
drop policy if exists gallery_controlled_read on storage.objects;
create policy gallery_attendee_preview_read on storage.objects for select using (
  bucket_id in ('hike-previews','hike-watermarked') and (
    public.current_role() = 'ADMIN'
    or public.can_operate_hike(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1 from public.bookings b
      where b.hike_id = ((storage.foldername(name))[1])::uuid
        and b.profile_id = public.current_profile_id()
        and b.status in ('CONFIRMED','COMPLETED')
    )
  )
);

-- site_content now supports one JSON document per public page.
alter table public.site_content drop constraint if exists site_content_id_check;
alter table public.site_content
  add column if not exists mobile_image_path text,
  add column if not exists image_metadata jsonb not null default '{}'::jsonb;
insert into public.site_content (id, content) values ('login', '{}'::jsonb) on conflict (id) do nothing;

-- Prevent disabling/demoting the final active administrator.
create or replace function public.protect_last_active_admin() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.role = 'ADMIN' and old.active and
     (new.role <> 'ADMIN' or not new.active or new.deleted_at is not null) and
     not exists (
       select 1 from public.profiles p
       where p.id <> old.id and p.role='ADMIN' and p.active and p.deleted_at is null
     ) then
    raise exception 'No se puede desactivar o cambiar al último administrador activo';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin before update on public.profiles
for each row execute function public.protect_last_active_admin();

create index if not exists profiles_staff_idx on public.profiles(role, active) where deleted_at is null;
create index if not exists photos_processing_idx on public.photos(gallery_id, processing_status) where deleted_at is null;

update storage.buckets set public=false where id in ('hike-previews','hike-watermarked');

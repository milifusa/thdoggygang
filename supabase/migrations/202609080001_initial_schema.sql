-- The Doggy Gang · initial production schema
create extension if not exists pgcrypto;

create type public.app_role as enum ('CLIENT', 'GUIDE', 'ADMIN');
create type public.booking_status as enum ('DRAFT', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
create type public.payment_status as enum ('PENDING', 'UNDER_REVIEW', 'PAID', 'FAILED', 'REFUNDED');
create type public.payment_method as enum ('CARD', 'TRANSFER');
create type public.transport_mode as enum ('NONE', 'OPTIONAL', 'INCLUDED');
create type public.checkin_method as enum ('QR', 'MANUAL');
create type public.photo_access as enum ('FREE_WATERMARKED', 'FREE_ORIGINAL', 'PAID');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  whatsapp text,
  birth_date date,
  emergency_contact_name text,
  emergency_contact_phone text,
  role public.app_role not null default 'CLIENT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.person_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  birth_date date,
  emergency_contact_name text,
  emergency_contact_phone text,
  is_minor boolean not null default false,
  guardian_person_id uuid references public.person_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (guardian_person_id is null or guardian_person_id <> id)
);

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  photo_path text,
  breed text,
  birth_date date,
  sex text check (sex in ('FEMALE', 'MALE', 'UNKNOWN')),
  size text check (size in ('SMALL', 'MEDIUM', 'LARGE', 'XL')),
  sterilized boolean,
  sociability text,
  reactivity text,
  medical_conditions text,
  medications text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.hikes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  starts_at timestamptz not null,
  location_name text not null,
  meeting_point text,
  price_cents integer not null check (price_cents >= 0),
  capacity integer not null check (capacity > 0),
  max_dogs integer check (max_dogs is null or max_dogs > 0),
  distance_km numeric(6,2),
  elevation_m integer,
  duration_minutes integer,
  difficulty text,
  terrain text,
  recommended_dog_sizes text[],
  includes text[],
  excludes text[],
  packing_list text[],
  recommendations text[],
  rules text,
  cancellation_policy text,
  cover_path text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.guide_hikes (
  hike_id uuid not null references public.hikes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (hike_id, profile_id)
);

create table public.transport_configurations (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null unique references public.hikes(id) on delete cascade,
  mode public.transport_mode not null default 'NONE',
  capacity integer check (capacity is null or capacity >= 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  departure_place text,
  departure_at timestamptz,
  return_details text,
  rules text,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number text not null unique,
  profile_id uuid not null references public.profiles(id),
  hike_id uuid not null references public.hikes(id),
  status public.booking_status not null default 'DRAFT',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  currency char(3) not null default 'MXN',
  expires_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_participants (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  person_profile_id uuid references public.person_profiles(id) on delete set null,
  guardian_booking_participant_id uuid references public.booking_participants(id),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (booking_id, person_profile_id)
);

create table public.booking_dogs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete set null,
  snapshot jsonb not null,
  has_changes boolean not null default false,
  created_at timestamptz not null default now(),
  unique (booking_id, dog_id)
);

create table public.transport_reservations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_participant_id uuid not null references public.booking_participants(id) on delete cascade,
  price_cents integer not null check (price_cents >= 0),
  dog_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (booking_id, booking_participant_id)
);

create table public.waiver_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.waiver_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.waiver_templates(id) on delete cascade,
  version integer not null,
  body text not null,
  body_hash text not null,
  published_at timestamptz not null default now(),
  unique (template_id, version)
);

create table public.signed_waivers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_participant_id uuid not null references public.booking_participants(id),
  waiver_version_id uuid not null references public.waiver_versions(id),
  signature_path text not null,
  pdf_path text not null,
  signed_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  document_hash text not null unique
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  profile_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  status public.payment_status not null default 'PENDING',
  total_cents integer not null check (total_cents >= 0),
  currency char(3) not null default 'MXN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_type text not null check (item_type in ('HIKE', 'TRANSPORT', 'PHOTO', 'PHOTO_PACKAGE')),
  reference_id uuid,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null,
  provider_payment_id text,
  method public.payment_method not null,
  status public.payment_status not null default 'PENDING',
  amount_cents integer not null check (amount_cents >= 0),
  raw_status text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.booking_checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_at timestamptz
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null references public.hikes(id),
  booking_id uuid not null references public.bookings(id),
  booking_participant_id uuid not null references public.booking_participants(id),
  checked_in boolean not null default true,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid not null references public.profiles(id),
  method public.checkin_method not null,
  notes text,
  client_operation_id uuid not null default gen_random_uuid(),
  unique (hike_id, booking_participant_id),
  unique (client_operation_id)
);

create table public.hike_galleries (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null unique references public.hikes(id) on delete cascade,
  title text not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.hike_galleries(id) on delete cascade,
  original_path text not null,
  thumbnail_path text not null,
  preview_path text not null,
  watermarked_path text not null,
  access public.photo_access not null default 'PAID',
  price_cents integer,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create table public.photo_packages (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.hike_galleries(id) on delete cascade,
  name text not null,
  photo_count integer,
  full_gallery boolean not null default false,
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true
);

create table public.photo_purchases (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id),
  profile_id uuid not null references public.profiles(id),
  photo_id uuid references public.photos(id),
  package_id uuid references public.photo_packages(id),
  download_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check ((photo_id is not null)::int + (package_id is not null)::int = 1)
);

create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'WHATSAPP', 'IN_APP')),
  template_key text not null,
  payload jsonb not null default '{}',
  status text not null default 'QUEUED',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  ip inet,
  created_at timestamptz not null default now()
);

create index bookings_profile_idx on public.bookings(profile_id, created_at desc);
create index bookings_hike_status_idx on public.bookings(hike_id, status);
create index participants_booking_idx on public.booking_participants(booking_id);
create index dogs_owner_idx on public.dogs(owner_profile_id) where deleted_at is null;
create index checkins_hike_idx on public.check_ins(hike_id, checked_in_at desc);
create index payments_order_idx on public.payments(order_id);
create index photos_gallery_idx on public.photos(gallery_id);
create index notifications_pending_idx on public.notifications(status, created_at) where sent_at is null;
create index audit_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.current_profile_id() returns uuid language sql stable security definer set search_path = public as $$ select id from profiles where auth_user_id = auth.uid() and deleted_at is null limit 1 $$;
create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = public as $$ select coalesce((select role from profiles where auth_user_id = auth.uid() and deleted_at is null limit 1), 'CLIENT'::public.app_role) $$;
create or replace function public.can_operate_hike(target_hike uuid) returns boolean language sql stable security definer set search_path = public as $$ select public.current_role() = 'ADMIN' or exists(select 1 from guide_hikes where hike_id = target_hike and profile_id = public.current_profile_id()) $$;

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'first_name', ''), coalesce(new.raw_user_meta_data->>'last_name', ''), new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.protect_profile_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and public.current_role() <> 'ADMIN' then raise exception 'Only admins can change roles'; end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles for each row execute function public.protect_profile_role();

alter table public.profiles enable row level security;
alter table public.person_profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.hikes enable row level security;
alter table public.guide_hikes enable row level security;
alter table public.transport_configurations enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_participants enable row level security;
alter table public.booking_dogs enable row level security;
alter table public.transport_reservations enable row level security;
alter table public.waiver_templates enable row level security;
alter table public.waiver_versions enable row level security;
alter table public.signed_waivers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.booking_checkin_tokens enable row level security;
alter table public.check_ins enable row level security;
alter table public.hike_galleries enable row level security;
alter table public.photos enable row level security;
alter table public.photo_packages enable row level security;
alter table public.photo_purchases enable row level security;
alter table public.admin_notes enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_read on public.profiles for select using (auth_user_id = auth.uid() or public.current_role() = 'ADMIN');
create policy profiles_self_update on public.profiles for update using (auth_user_id = auth.uid() or public.current_role() = 'ADMIN') with check (auth_user_id = auth.uid() or public.current_role() = 'ADMIN');
create policy people_owner_all on public.person_profiles for all using (owner_profile_id = public.current_profile_id() or public.current_role() = 'ADMIN') with check (owner_profile_id = public.current_profile_id() or public.current_role() = 'ADMIN');
create policy dogs_owner_all on public.dogs for all using (owner_profile_id = public.current_profile_id() or public.current_role() = 'ADMIN') with check (owner_profile_id = public.current_profile_id() or public.current_role() = 'ADMIN');
create policy hikes_public_read on public.hikes for select using (published or public.current_role() in ('GUIDE','ADMIN'));
create policy hikes_admin_write on public.hikes for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy guide_hikes_staff_read on public.guide_hikes for select using (profile_id = public.current_profile_id() or public.current_role() = 'ADMIN');
create policy guide_hikes_admin_write on public.guide_hikes for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy transport_public_read on public.transport_configurations for select using (exists(select 1 from public.hikes h where h.id = hike_id and h.published) or public.can_operate_hike(hike_id));
create policy transport_admin_write on public.transport_configurations for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy bookings_owner_read on public.bookings for select using (profile_id = public.current_profile_id() or public.can_operate_hike(hike_id));
create policy bookings_owner_insert on public.bookings for insert with check (profile_id = public.current_profile_id());
create policy bookings_owner_update on public.bookings for update using (profile_id = public.current_profile_id() or public.can_operate_hike(hike_id)) with check (profile_id = public.current_profile_id() or public.can_operate_hike(hike_id));
create policy participant_booking_access on public.booking_participants for all using (exists(select 1 from public.bookings b where b.id = booking_id and (b.profile_id = public.current_profile_id() or public.can_operate_hike(b.hike_id)))) with check (exists(select 1 from public.bookings b where b.id = booking_id and (b.profile_id = public.current_profile_id() or public.can_operate_hike(b.hike_id))));
create policy booking_dog_access on public.booking_dogs for all using (exists(select 1 from public.bookings b where b.id = booking_id and (b.profile_id = public.current_profile_id() or public.can_operate_hike(b.hike_id)))) with check (exists(select 1 from public.bookings b where b.id = booking_id and (b.profile_id = public.current_profile_id() or public.can_operate_hike(b.hike_id))));
create policy transport_reservation_access on public.transport_reservations for all using (exists(select 1 from public.bookings b where b.id = booking_id and (b.profile_id = public.current_profile_id() or public.can_operate_hike(b.hike_id)))) with check (exists(select 1 from public.bookings b where b.id = booking_id and b.profile_id = public.current_profile_id()));
create policy waiver_templates_read on public.waiver_templates for select using (auth.uid() is not null);
create policy waiver_versions_read on public.waiver_versions for select using (auth.uid() is not null);
create policy waiver_admin_write on public.waiver_templates for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy waiver_versions_admin_write on public.waiver_versions for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy signed_waivers_access on public.signed_waivers for select using (exists(select 1 from public.bookings b where b.id = booking_id and (b.profile_id = public.current_profile_id() or public.can_operate_hike(b.hike_id))));
create policy signed_waivers_owner_insert on public.signed_waivers for insert with check (exists(select 1 from public.bookings b where b.id = booking_id and b.profile_id = public.current_profile_id()));
create policy orders_owner_read on public.orders for select using (profile_id = public.current_profile_id() or public.current_role() = 'ADMIN');
create policy orders_owner_insert on public.orders for insert with check (profile_id = public.current_profile_id());
create policy order_items_access on public.order_items for select using (exists(select 1 from public.orders o where o.id = order_id and (o.profile_id = public.current_profile_id() or public.current_role() = 'ADMIN')));
create policy payments_access on public.payments for select using (exists(select 1 from public.orders o where o.id = order_id and (o.profile_id = public.current_profile_id() or public.current_role() = 'ADMIN')));
create policy receipts_access on public.payment_receipts for select using (uploaded_by = public.current_profile_id() or public.current_role() = 'ADMIN');
create policy receipts_owner_insert on public.payment_receipts for insert with check (uploaded_by = public.current_profile_id());
create policy checkin_tokens_owner_read on public.booking_checkin_tokens for select using (exists(select 1 from public.bookings b where b.id = booking_id and b.profile_id = public.current_profile_id()) or public.current_role() = 'ADMIN');
create policy checkins_staff_read on public.check_ins for select using (public.can_operate_hike(hike_id) or exists(select 1 from public.bookings b where b.id = booking_id and b.profile_id = public.current_profile_id()));
create policy checkins_staff_write on public.check_ins for insert with check (public.can_operate_hike(hike_id));
create policy galleries_visible on public.hike_galleries for select using (published_at is not null or public.current_role() = 'ADMIN');
create policy galleries_admin_write on public.hike_galleries for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy photos_visible on public.photos for select using (exists(select 1 from public.hike_galleries g where g.id = gallery_id and g.published_at is not null) or public.current_role() = 'ADMIN');
create policy photos_admin_write on public.photos for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy packages_visible on public.photo_packages for select using (active or public.current_role() = 'ADMIN');
create policy packages_admin_write on public.photo_packages for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy purchases_owner_read on public.photo_purchases for select using (profile_id = public.current_profile_id() or public.current_role() = 'ADMIN');
create policy notes_staff_only on public.admin_notes for all using (public.current_role() in ('GUIDE','ADMIN')) with check (public.current_role() in ('GUIDE','ADMIN'));
create policy notifications_owner on public.notifications for select using (profile_id = public.current_profile_id() or public.current_role() = 'ADMIN');
create policy audit_admin_read on public.audit_logs for select using (public.current_role() = 'ADMIN');

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger people_updated before update on public.person_profiles for each row execute function public.set_updated_at();
create trigger dogs_updated before update on public.dogs for each row execute function public.set_updated_at();
create trigger hikes_updated before update on public.hikes for each row execute function public.set_updated_at();
create trigger bookings_updated before update on public.bookings for each row execute function public.set_updated_at();
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();

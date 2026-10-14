-- Configurable camping options per hike and one camping choice per booking.
create table if not exists public.hike_camping_options (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null references public.hikes(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text not null default '' check (char_length(description) <= 600),
  price_cents integer not null check (price_cents >= 0),
  pricing_mode text not null default 'PER_RESERVATION'
    check (pricing_mode in ('PER_RESERVATION','PER_PERSON')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hike_camping_options_hike_idx
  on public.hike_camping_options(hike_id, active, sort_order);

create table if not exists public.booking_camping_selections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  camping_option_id uuid not null references public.hike_camping_options(id),
  option_name text not null,
  pricing_mode text not null check (pricing_mode in ('PER_RESERVATION','PER_PERSON')),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hike_camping_options enable row level security;
alter table public.booking_camping_selections enable row level security;

create policy hike_camping_options_public_read on public.hike_camping_options
  for select using (
    (active and exists(
      select 1 from public.hikes h
      where h.id = hike_id and h.published and h.deleted_at is null
    )) or public.current_role() = 'ADMIN'
  );
create policy hike_camping_options_admin_write on public.hike_camping_options
  for all using (public.current_role() = 'ADMIN')
  with check (public.current_role() = 'ADMIN');

create policy booking_camping_selections_read on public.booking_camping_selections
  for select using (exists(
    select 1 from public.bookings b
    where b.id = booking_id
      and (b.profile_id = public.current_profile_id() or public.can_operate_hike(b.hike_id))
  ));

drop trigger if exists hike_camping_options_updated on public.hike_camping_options;
create trigger hike_camping_options_updated before update on public.hike_camping_options
  for each row execute function public.set_updated_at();
drop trigger if exists booking_camping_selections_updated on public.booking_camping_selections;
create trigger booking_camping_selections_updated before update on public.booking_camping_selections
  for each row execute function public.set_updated_at();

alter table public.bookings drop constraint if exists bookings_current_step_check;
alter table public.bookings add constraint bookings_current_step_check
  check (current_step in ('manada','personas','perritos','transporte','camping','productos','responsiva','pago','confirmacion'));

alter table public.order_items drop constraint if exists order_items_item_type_check;
alter table public.order_items add constraint order_items_item_type_check
  check (item_type in ('HIKE','TRANSPORT','PHOTO','PHOTO_PACKAGE','PRODUCT','SHIPPING','CAMPING'));

revoke insert, update, delete on public.hike_camping_options from anon;
grant select on public.hike_camping_options to anon, authenticated;
grant insert, update, delete on public.hike_camping_options to authenticated;
revoke insert, update, delete on public.booking_camping_selections from anon, authenticated;
grant select on public.booking_camping_selections to authenticated;

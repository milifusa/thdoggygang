-- Keep one active reservation per profile/hike and add the merchandise catalog.
update public.bookings draft set status='CANCELLED',cancelled_at=now(),updated_at=now()
where draft.status = 'DRAFT'
  and exists (
    select 1 from public.bookings active
    where active.profile_id = draft.profile_id
      and active.hike_id = draft.hike_id
      and active.status in ('PENDING_PAYMENT','CONFIRMED')
  );

with duplicate_drafts as (
  select id, row_number() over (partition by profile_id, hike_id order by updated_at desc, created_at desc) as position
  from public.bookings where status = 'DRAFT'
)
update public.bookings set status='CANCELLED',cancelled_at=now(),updated_at=now()
where id in (select id from duplicate_drafts where position > 1);

with duplicate_active as (
  select id, row_number() over (
    partition by profile_id, hike_id
    order by case status when 'CONFIRMED' then 1 when 'PENDING_PAYMENT' then 2 else 3 end, updated_at desc
  ) as position
  from public.bookings where status in ('DRAFT','PENDING_PAYMENT','CONFIRMED')
)
update public.bookings set status = 'CANCELLED', cancelled_at = now(), updated_at = now()
where id in (select id from duplicate_active where position > 1);

create unique index if not exists bookings_one_active_per_hike
  on public.bookings(profile_id, hike_id)
  where status in ('DRAFT','PENDING_PAYMENT','CONFIRMED');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  category text not null default 'Equipo de hiking',
  price_cents integer not null check (price_cents >= 0),
  stock integer not null default 0 check (stock >= 0),
  variants text[] not null default '{}',
  image_path text,
  pickup_enabled boolean not null default true,
  shipping_enabled boolean not null default true,
  shipping_fee_cents integer not null default 8000 check (shipping_fee_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.booking_product_selections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  unique (booking_id, product_id, variant)
);

alter table public.orders
  add column if not exists fulfillment_mode text check (fulfillment_mode in ('HIKE_PICKUP','SHIPPING')),
  add column if not exists pickup_hike_id uuid references public.hikes(id),
  add column if not exists shipping_address jsonb,
  add column if not exists shipping_cents integer not null default 0 check (shipping_cents >= 0),
  add column if not exists tracking_number text,
  add column if not exists inventory_committed_at timestamptz;

alter table public.order_items drop constraint if exists order_items_item_type_check;
alter table public.order_items add constraint order_items_item_type_check
  check (item_type in ('HIKE','TRANSPORT','PHOTO','PHOTO_PACKAGE','PRODUCT','SHIPPING'));

alter table public.products enable row level security;
alter table public.booking_product_selections enable row level security;
create policy products_public_read on public.products for select
  using ((active and deleted_at is null) or public.current_role() = 'ADMIN');
create policy products_admin_write on public.products for all
  using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy booking_products_access on public.booking_product_selections for all
  using (exists(select 1 from public.bookings b where b.id = booking_id and (b.profile_id = public.current_profile_id() or public.current_role() = 'ADMIN')))
  with check (exists(select 1 from public.bookings b where b.id = booking_id and (b.profile_id = public.current_profile_id() or public.current_role() = 'ADMIN')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy product_images_public_read on storage.objects for select using (bucket_id = 'product-images');
create policy product_images_admin_insert on storage.objects for insert with check (bucket_id = 'product-images' and public.current_role() = 'ADMIN');
create policy product_images_admin_update on storage.objects for update using (bucket_id = 'product-images' and public.current_role() = 'ADMIN') with check (bucket_id = 'product-images' and public.current_role() = 'ADMIN');
create policy product_images_admin_delete on storage.objects for delete using (bucket_id = 'product-images' and public.current_role() = 'ADMIN');

insert into public.products (slug,name,description,price_cents,stock,variants,image_path,pickup_enabled,shipping_enabled,shipping_fee_cents)
values
  ('correa-urbana-2m','Correa urbana 2 m','Correa de alta durabilidad con ganchos metálicos reforzados y agarradera acolchada. Conserva el control en ciudad sin limitar el movimiento.',42000,20,array['Gris','Rojo','Azul'],'/products/correa-urbana-2m.jpg',true,true,8000),
  ('correa-movimiento-5m','Correa movimiento 5 m','Cuerda suave y resistente con gancho metálico. Ofrece libertad media con control responsable para todos los tamaños.',30000,20,array['Negro'],'/products/correa-movimiento-5m.jpg',true,true,8000),
  ('adaptador-de-botella','Adaptador de botella','Adaptador flexible compatible con botellas de agua estándar para hidratar o limpiar las patitas al terminar el paseo.',9000,30,array[]::text[],'/products/adaptador-botella.jpg',true,true,8000),
  ('plato-portatil','Plato portátil','Plato impermeable, plegable, ligero y con cierre para llevar agua o alimento durante la aventura.',15000,30,array[]::text[],'/products/plato-portatil.jpg',true,true,8000)
on conflict (slug) do update set
  name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,
  variants=excluded.variants,image_path=excluded.image_path,active=true,deleted_at=null;

create or replace function public.commit_product_inventory(p_order_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_committed timestamptz;
begin
  select inventory_committed_at into v_committed from public.orders where id=p_order_id and status='PAID' for update;
  if not found then raise exception 'Paid order not found'; end if;
  if v_committed is not null then return; end if;
  if exists (
    select 1 from (
      select reference_id as product_id,sum(quantity)::integer as quantity
      from public.order_items where order_id=p_order_id and item_type='PRODUCT' group by reference_id
    ) needed join public.products p on p.id=needed.product_id where p.stock<needed.quantity
  ) then raise exception 'Insufficient product stock'; end if;
  update public.products p set stock=p.stock-needed.quantity,updated_at=now()
  from (
    select reference_id as product_id,sum(quantity)::integer as quantity
    from public.order_items where order_id=p_order_id and item_type='PRODUCT' group by reference_id
  ) needed where p.id=needed.product_id;
  update public.orders set inventory_committed_at=now(),updated_at=now() where id=p_order_id;
end $$;

-- Completion workflows: guardians, cancellations/refunds, receipts, shop settings and durable photo failures.
alter table public.person_profiles
  add column if not exists whatsapp text;

alter table public.photos
  add column if not exists processing_error text;

create table if not exists public.booking_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  reason text not null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','APPROVED','REJECTED','REFUNDED')),
  refundable_amount_cents integer not null default 0 check (refundable_amount_cents >= 0),
  resolved_by uuid references public.profiles(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists booking_cancellation_open_idx
  on public.booking_cancellation_requests(booking_id)
  where status = 'REQUESTED';
create index if not exists booking_cancellation_status_idx
  on public.booking_cancellation_requests(status, created_at desc);

create table if not exists public.shop_settings (
  id smallint primary key default 1 check (id = 1),
  shipping_fee_cents integer not null default 8000 check (shipping_fee_cents >= 0),
  free_shipping_threshold_cents integer check (free_shipping_threshold_cents is null or free_shipping_threshold_cents >= 0),
  shipping_note text not null default 'Envío nacional dentro de México.',
  updated_at timestamptz not null default now()
);
insert into public.shop_settings(id) values (1) on conflict (id) do nothing;

alter table public.booking_cancellation_requests enable row level security;
alter table public.shop_settings enable row level security;

create policy booking_cancellations_owner_read on public.booking_cancellation_requests for select
  using (exists(select 1 from public.bookings b where b.id=booking_id and b.profile_id=public.current_profile_id()) or public.current_role()='ADMIN');
create policy booking_cancellations_owner_insert on public.booking_cancellation_requests for insert
  with check (requested_by=public.current_profile_id() and exists(select 1 from public.bookings b where b.id=booking_id and b.profile_id=public.current_profile_id()));
create policy booking_cancellations_admin_update on public.booking_cancellation_requests for update
  using (public.current_role()='ADMIN') with check (public.current_role()='ADMIN');
create policy shop_settings_public_read on public.shop_settings for select using (true);
create policy shop_settings_admin_write on public.shop_settings for all
  using (public.current_role()='ADMIN') with check (public.current_role()='ADMIN');

-- Recreate the draft function so minor participants retain their guardian relation.
create or replace function public.save_booking_draft(
  p_hike_slug text,
  p_booking_id uuid,
  p_person_ids uuid[],
  p_dog_ids uuid[],
  p_transport_person_ids uuid[] default '{}'
) returns uuid
language plpgsql security invoker set search_path=public as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_hike public.hikes%rowtype;
  v_booking_id uuid;
  v_transport_price integer := 0;
  v_hike_total integer := 0;
  v_total integer;
begin
  if v_profile_id is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_person_ids,1),0)=0 then raise exception 'At least one person is required'; end if;
  select * into v_hike from public.hikes where slug=p_hike_slug and published and deleted_at is null for share;
  if not found then raise exception 'Hike not found'; end if;
  if exists(select 1 from unnest(p_person_ids) selected(id) left join public.person_profiles p on p.id=selected.id and p.owner_profile_id=v_profile_id and p.deleted_at is null where p.id is null) then raise exception 'Invalid participant'; end if;
  if exists(select 1 from public.person_profiles p where p.id=any(p_person_ids) and p.is_minor and (p.guardian_person_id is null or not p.guardian_person_id=any(p_person_ids))) then raise exception 'Every minor requires a selected guardian'; end if;
  if exists(select 1 from unnest(p_dog_ids) selected(id) left join public.dogs d on d.id=selected.id and d.owner_profile_id=v_profile_id and d.deleted_at is null where d.id is null) then raise exception 'Invalid dog'; end if;
  if exists(select 1 from unnest(p_transport_person_ids) selected(id) where not selected.id=any(p_person_ids)) then raise exception 'Transport participant must be in booking'; end if;

  if p_booking_id is null then
    insert into public.bookings(booking_number,profile_id,hike_id,status)
    values('TDG-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),v_profile_id,v_hike.id,'DRAFT') returning id into v_booking_id;
  else
    select id into v_booking_id from public.bookings where id=p_booking_id and profile_id=v_profile_id and status in ('DRAFT','PENDING_PAYMENT') for update;
    if not found then raise exception 'Draft not found'; end if;
  end if;

  delete from public.signed_waivers where booking_id=v_booking_id;
  delete from public.transport_reservations where booking_id=v_booking_id;
  delete from public.booking_participants where booking_id=v_booking_id;
  delete from public.booking_dogs where booking_id=v_booking_id;

  insert into public.booking_participants(booking_id,person_profile_id,snapshot)
  select v_booking_id,p.id,jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'email',p.email,'phone',p.phone,'whatsapp',p.whatsapp,'birth_date',p.birth_date,'is_minor',p.is_minor,'guardian_person_id',p.guardian_person_id,'emergency_contact_name',p.emergency_contact_name,'emergency_contact_phone',p.emergency_contact_phone)
  from public.person_profiles p where p.id=any(p_person_ids) and p.owner_profile_id=v_profile_id;

  update public.booking_participants minor set guardian_booking_participant_id=guardian.id
  from public.person_profiles source, public.booking_participants guardian
  where minor.booking_id=v_booking_id and source.id=minor.person_profile_id and source.guardian_person_id=guardian.person_profile_id and guardian.booking_id=v_booking_id;

  insert into public.booking_dogs(booking_id,dog_id,snapshot)
  select v_booking_id,d.id,jsonb_build_object('name',d.name,'breed',d.breed,'birth_date',d.birth_date,'sex',d.sex,'size',d.size,'sociability',d.sociability,'reactivity',d.reactivity,'medical_conditions',d.medical_conditions,'medications',d.medications,'notes',d.notes)
  from public.dogs d where d.id=any(p_dog_ids) and d.owner_profile_id=v_profile_id;

  select case when tc.mode='INCLUDED' then 0 else tc.price_cents end into v_transport_price from public.transport_configurations tc where tc.hike_id=v_hike.id;
  v_transport_price:=coalesce(v_transport_price,0);
  insert into public.transport_reservations(booking_id,booking_participant_id,price_cents,dog_ids)
  select v_booking_id,bp.id,v_transport_price,p_dog_ids from public.booking_participants bp where bp.booking_id=v_booking_id and bp.person_profile_id=any(p_transport_person_ids);
  if v_hike.pricing_mode='PERSON_DOG_BUNDLE' then
    v_hike_total:=cardinality(p_person_ids)*v_hike.price_cents+greatest(cardinality(p_dog_ids)-cardinality(p_person_ids),0)*v_hike.dog_price_cents;
  else
    v_hike_total:=cardinality(p_person_ids)*v_hike.price_cents+cardinality(p_dog_ids)*v_hike.dog_price_cents;
  end if;
  v_total:=v_hike_total+cardinality(p_transport_person_ids)*v_transport_price;
  update public.bookings set subtotal_cents=v_total,total_cents=v_total,updated_at=now() where id=v_booking_id;
  return v_booking_id;
end $$;
grant execute on function public.save_booking_draft(text,uuid,uuid[],uuid[],uuid[]) to authenticated;

create or replace function public.restore_product_inventory(p_order_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.products p set stock=p.stock+items.quantity,updated_at=now()
  from (
    select reference_id,sum(quantity)::integer quantity from public.order_items
    where order_id=p_order_id and item_type='PRODUCT' and reference_id is not null group by reference_id
  ) items where p.id=items.reference_id;
end $$;
revoke all on function public.restore_product_inventory(uuid) from public,anon,authenticated;
grant execute on function public.restore_product_inventory(uuid) to service_role;

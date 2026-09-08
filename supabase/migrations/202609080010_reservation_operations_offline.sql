-- Reservation operations, fulfilment tracking and offline-safe Hike Mode.
alter table public.bookings
  add column if not exists current_step text not null default 'manada',
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists last_reminder_at timestamptz;

alter table public.bookings drop constraint if exists bookings_current_step_check;
alter table public.bookings add constraint bookings_current_step_check
  check (current_step in ('manada','personas','perritos','productos','responsiva','pago','confirmacion'));

create index if not exists bookings_operations_idx
  on public.bookings(status, last_activity_at desc, created_at desc);

create table if not exists public.booking_continue_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  token_hash text not null unique,
  current_step text not null,
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists booking_continue_active_idx
  on public.booking_continue_tokens(booking_id, expires_at desc) where revoked_at is null;

create table if not exists public.booking_communications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  channel text not null check (channel in ('EMAIL','WHATSAPP','IN_APP')),
  kind text not null,
  recipient text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','SENT','DELIVERED','FAILED')),
  provider_id text,
  metadata jsonb not null default '{}',
  sent_by uuid references public.profiles(id),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists booking_communications_booking_idx
  on public.booking_communications(booking_id, created_at desc);
create index if not exists booking_communications_rate_idx
  on public.booking_communications(booking_id, kind, created_at desc);

create table if not exists public.email_templates (
  key text primary key,
  subject text not null,
  heading text not null,
  body text not null,
  button_label text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.email_templates (key, subject, heading, body, button_label)
values (
  'BOOKING_REMINDER',
  'Tu aventura sigue esperando',
  'Termina tu reservación',
  'Guardamos tu avance. Retoma el proceso desde el paso exacto donde lo dejaste y asegura tu lugar en la manada.',
  'CONTINUAR RESERVACIÓN'
)
on conflict (key) do nothing;

create table if not exists public.order_item_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  hike_id uuid references public.hikes(id),
  status text not null default 'PENDING' check (status in ('PENDING','PREPARED','DELIVERED','SHIPPED','CANCELLED')),
  delivery_location text,
  delivered_by uuid references public.profiles(id),
  delivered_at timestamptz,
  prepared_at timestamptz,
  shipped_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_item_fulfillments_hike_idx
  on public.order_item_fulfillments(hike_id, status, updated_at desc);

insert into public.order_item_fulfillments (order_item_id, hike_id)
select oi.id, case when o.fulfillment_mode = 'HIKE_PICKUP' then o.pickup_hike_id else null end
from public.order_items oi
join public.orders o on o.id = oi.order_id
where oi.item_type = 'PRODUCT'
on conflict (order_item_id) do nothing;

create or replace function public.create_order_item_fulfillment() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_hike uuid;
begin
  if new.item_type <> 'PRODUCT' then return new; end if;
  select case when fulfillment_mode='HIKE_PICKUP' then pickup_hike_id else null end into v_hike
  from public.orders where id=new.order_id;
  insert into public.order_item_fulfillments(order_item_id,hike_id)
  values(new.id,v_hike) on conflict(order_item_id) do nothing;
  return new;
end $$;

drop trigger if exists order_item_fulfillment_after_insert on public.order_items;
create trigger order_item_fulfillment_after_insert after insert on public.order_items
for each row execute function public.create_order_item_fulfillment();

create table if not exists public.hike_offline_authorizations (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null references public.hikes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hike_offline_authorizations_active_idx
  on public.hike_offline_authorizations(hike_id, profile_id, expires_at)
  where revoked_at is null;

create table if not exists public.offline_sync_operations (
  operation_id uuid primary key,
  hike_id uuid not null references public.hikes(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  participant_id uuid references public.booking_participants(id) on delete cascade,
  operation_type text not null check (operation_type in ('CHECK_IN','PRODUCT_DELIVERY','NOTE')),
  actor_profile_id uuid not null references public.profiles(id),
  device_id text not null,
  payload jsonb not null default '{}',
  client_timestamp timestamptz not null,
  result jsonb not null default '{}',
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists offline_sync_hike_idx
  on public.offline_sync_operations(hike_id, applied_at desc);

alter table public.booking_checkin_tokens
  add column if not exists token_id uuid,
  add column if not exists token_version integer not null default 1,
  add column if not exists signed_payload jsonb,
  add column if not exists expires_at timestamptz;

create unique index if not exists booking_checkin_tokens_token_id_idx
  on public.booking_checkin_tokens(token_id) where token_id is not null;

create or replace function public.touch_booking_activity() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_booking_id uuid;
begin
  v_booking_id := coalesce(new.booking_id, old.booking_id);
  update public.bookings set last_activity_at=now(),updated_at=now() where id=v_booking_id;
  return coalesce(new,old);
end $$;

drop trigger if exists booking_participants_touch_activity on public.booking_participants;
create trigger booking_participants_touch_activity after insert or update or delete on public.booking_participants
for each row execute function public.touch_booking_activity();
drop trigger if exists booking_dogs_touch_activity on public.booking_dogs;
create trigger booking_dogs_touch_activity after insert or update or delete on public.booking_dogs
for each row execute function public.touch_booking_activity();
drop trigger if exists signed_waivers_touch_activity on public.signed_waivers;
create trigger signed_waivers_touch_activity after insert or update or delete on public.signed_waivers
for each row execute function public.touch_booking_activity();

create or replace function public.apply_hike_offline_operation(p_operation jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_operation_id uuid := (p_operation->>'operationId')::uuid;
  v_hike_id uuid := (p_operation->>'hikeId')::uuid;
  v_booking_id uuid := nullif(p_operation->>'bookingId','')::uuid;
  v_participant_id uuid := nullif(p_operation->>'participantId','')::uuid;
  v_type text := p_operation->>'type';
  v_device_id text := coalesce(nullif(p_operation->>'deviceId',''),'unknown');
  v_client_timestamp timestamptz := coalesce(nullif(p_operation->>'clientTimestamp','')::timestamptz,now());
  v_result jsonb;
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id=p_actor and active=true and deleted_at is null;
  if not found or v_profile.role not in ('ADMIN','GUIDE') then raise exception 'Not authorized'; end if;
  if v_profile.role='GUIDE' and not exists(select 1 from public.guide_hikes where hike_id=v_hike_id and profile_id=p_actor) then
    raise exception 'Guide is not assigned to this hike';
  end if;

  select result into v_result from public.offline_sync_operations where operation_id=v_operation_id;
  if found then return v_result || jsonb_build_object('duplicate',true); end if;

  if v_type='CHECK_IN' then
    if not exists(select 1 from public.booking_participants bp join public.bookings b on b.id=bp.booking_id where bp.id=v_participant_id and b.id=v_booking_id and b.hike_id=v_hike_id) then
      raise exception 'Participant does not belong to this hike';
    end if;
    insert into public.check_ins(hike_id,booking_id,booking_participant_id,checked_in_by,method,client_operation_id,checked_in_at)
    values(v_hike_id,v_booking_id,v_participant_id,p_actor,'QR',v_operation_id,v_client_timestamp)
    on conflict(hike_id,booking_participant_id) do nothing;
    v_result := jsonb_build_object('ok',true,'status','CHECKED_IN','participantId',v_participant_id);
  elsif v_type='PRODUCT_DELIVERY' then
    update public.order_item_fulfillments f set
      status='DELIVERED',delivered_by=p_actor,delivered_at=v_client_timestamp,
      delivery_location=coalesce(p_operation->'payload'->>'deliveryLocation',f.delivery_location),
      note=coalesce(p_operation->'payload'->>'note',f.note),updated_at=now()
    from public.order_items oi join public.orders o on o.id=oi.order_id
    where f.order_item_id=(p_operation->>'orderItemId')::uuid and oi.id=f.order_item_id
      and o.pickup_hike_id=v_hike_id and o.fulfillment_mode='HIKE_PICKUP';
    if not found then raise exception 'Delivery item does not belong to this hike'; end if;
    v_result := jsonb_build_object('ok',true,'status','DELIVERED','orderItemId',p_operation->>'orderItemId');
  elsif v_type='NOTE' then
    insert into public.admin_notes(booking_id,author_profile_id,body)
    values(v_booking_id,p_actor,left(coalesce(p_operation->'payload'->>'body',''),2000));
    v_result := jsonb_build_object('ok',true,'status','SAVED');
  else
    raise exception 'Unsupported operation type';
  end if;

  insert into public.offline_sync_operations(operation_id,hike_id,booking_id,participant_id,operation_type,actor_profile_id,device_id,payload,client_timestamp,result)
  values(v_operation_id,v_hike_id,v_booking_id,v_participant_id,v_type,p_actor,v_device_id,coalesce(p_operation->'payload','{}'::jsonb),v_client_timestamp,v_result);
  return v_result;
end $$;

revoke all on function public.apply_hike_offline_operation(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.apply_hike_offline_operation(jsonb,uuid) to service_role;

alter table public.booking_continue_tokens enable row level security;
alter table public.booking_communications enable row level security;
alter table public.email_templates enable row level security;
alter table public.order_item_fulfillments enable row level security;
alter table public.hike_offline_authorizations enable row level security;
alter table public.offline_sync_operations enable row level security;

create policy booking_continue_admin_all on public.booking_continue_tokens for all
  using (public.current_role()='ADMIN') with check (public.current_role()='ADMIN');
create policy booking_communications_staff_read on public.booking_communications for select
  using (exists(select 1 from public.bookings b where b.id=booking_id and public.can_operate_hike(b.hike_id)));
create policy booking_communications_admin_write on public.booking_communications for all
  using (public.current_role()='ADMIN') with check (public.current_role()='ADMIN');
create policy email_templates_admin_all on public.email_templates for all
  using (public.current_role()='ADMIN') with check (public.current_role()='ADMIN');
create policy fulfillment_staff_access on public.order_item_fulfillments for all
  using (hike_id is not null and public.can_operate_hike(hike_id) or public.current_role()='ADMIN')
  with check (hike_id is not null and public.can_operate_hike(hike_id) or public.current_role()='ADMIN');
create policy offline_authorizations_staff_access on public.hike_offline_authorizations for all
  using (profile_id=public.current_profile_id() and public.can_operate_hike(hike_id) or public.current_role()='ADMIN')
  with check (profile_id=public.current_profile_id() and public.can_operate_hike(hike_id) or public.current_role()='ADMIN');
create policy offline_operations_staff_read on public.offline_sync_operations for select
  using (public.can_operate_hike(hike_id));

create policy admin_notes_staff_read on public.admin_notes for select
  using (booking_id is not null and exists(select 1 from public.bookings b where b.id=booking_id and public.can_operate_hike(b.hike_id)));
create policy admin_notes_staff_insert on public.admin_notes for insert
  with check (author_profile_id=public.current_profile_id() and booking_id is not null and exists(select 1 from public.bookings b where b.id=booking_id and public.can_operate_hike(b.hike_id)));

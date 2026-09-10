-- Products added during a reservation inherit the reservation's hike even
-- though the order does not use the standalone shop fulfillment fields.
update public.order_item_fulfillments f
set hike_id = b.hike_id,
    updated_at = now()
from public.order_items oi
join public.orders o on o.id = oi.order_id
join public.bookings b on b.id = o.booking_id
where f.order_item_id = oi.id
  and oi.item_type = 'PRODUCT'
  and f.hike_id is null
  and o.fulfillment_mode is null;

create or replace function public.create_order_item_fulfillment() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_hike uuid;
begin
  if new.item_type <> 'PRODUCT' then return new; end if;
  select case
    when o.fulfillment_mode = 'HIKE_PICKUP' then o.pickup_hike_id
    when o.fulfillment_mode is null then b.hike_id
    else null
  end
  into v_hike
  from public.orders o
  left join public.bookings b on b.id = o.booking_id
  where o.id = new.order_id;
  insert into public.order_item_fulfillments(order_item_id,hike_id)
  values(new.id,v_hike) on conflict(order_item_id) do nothing;
  return new;
end $$;

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
  v_result jsonb; v_profile public.profiles%rowtype; v_expected integer; v_checked integer;
begin
  select * into v_profile from public.profiles where id=p_actor and active=true and deleted_at is null;
  if not found or v_profile.role not in ('ADMIN','GUIDE') then raise exception 'Not authorized'; end if;
  if v_profile.role='GUIDE' and not exists(select 1 from public.guide_hikes where hike_id=v_hike_id and profile_id=p_actor) then raise exception 'Guide is not assigned to this hike'; end if;
  select result into v_result from public.offline_sync_operations where operation_id=v_operation_id;
  if found then return v_result || jsonb_build_object('duplicate',true); end if;

  if v_type='CHECK_IN' then
    if not exists(select 1 from public.booking_participants bp join public.bookings b on b.id=bp.booking_id where bp.id=v_participant_id and b.id=v_booking_id and b.hike_id=v_hike_id and b.status='CONFIRMED' and (select count(*) from public.signed_waivers sw where sw.booking_id=b.id)>=(select count(*) from public.booking_participants all_bp where all_bp.booking_id=b.id) and exists(select 1 from public.booking_checkin_tokens t where t.booking_id=b.id and t.revoked_at is null and t.used_at is null and (t.expires_at is null or t.expires_at>now()))) then raise exception 'Booking is not eligible for check-in'; end if;
    insert into public.check_ins(hike_id,booking_id,booking_participant_id,checked_in_by,method,client_operation_id,checked_in_at) values(v_hike_id,v_booking_id,v_participant_id,p_actor,'QR',v_operation_id,v_client_timestamp) on conflict(hike_id,booking_participant_id) do nothing;
    select count(*) into v_expected from public.booking_participants where booking_id=v_booking_id; select count(*) into v_checked from public.check_ins where booking_id=v_booking_id;
    if v_checked>=v_expected then update public.booking_checkin_tokens set used_at=coalesce(used_at,now()) where booking_id=v_booking_id and revoked_at is null; end if;
    v_result:=jsonb_build_object('ok',true,'status','CHECKED_IN','participantId',v_participant_id);
  elsif v_type='PRODUCT_DELIVERY' then
    update public.order_item_fulfillments f
    set status='DELIVERED',delivered_by=p_actor,delivered_at=v_client_timestamp,
        delivery_location=coalesce(p_operation->'payload'->>'deliveryLocation',f.delivery_location),
        note=coalesce(p_operation->'payload'->>'note',f.note),updated_at=now()
    from public.order_items oi
    join public.orders o on o.id=oi.order_id
    where f.order_item_id=(p_operation->>'orderItemId')::uuid
      and oi.id=f.order_item_id
      and oi.item_type='PRODUCT'
      and (
        (o.fulfillment_mode='HIKE_PICKUP' and o.pickup_hike_id=v_hike_id)
        or
        (o.fulfillment_mode is null and exists(
          select 1 from public.bookings b
          where b.id=o.booking_id and b.hike_id=v_hike_id
        ))
      );
    if not found then raise exception 'Delivery item does not belong to this hike'; end if;
    v_result:=jsonb_build_object('ok',true,'status','DELIVERED','orderItemId',p_operation->>'orderItemId');
  elsif v_type='TRANSPORT_COMPLETE' then
    insert into public.hike_transport_departures(hike_id,completed_by,completed_at,passenger_count,note) values(v_hike_id,p_actor,v_client_timestamp,greatest(0,coalesce((p_operation->'payload'->>'passengerCount')::integer,0)),nullif(p_operation->'payload'->>'note','')) on conflict(hike_id) do update set completed_by=excluded.completed_by,completed_at=excluded.completed_at,passenger_count=excluded.passenger_count,note=excluded.note,updated_at=now();
    v_result:=jsonb_build_object('ok',true,'status','TRANSPORT_COMPLETE');
  elsif v_type='NOTE' then
    insert into public.admin_notes(booking_id,author_profile_id,body) values(v_booking_id,p_actor,left(coalesce(p_operation->'payload'->>'body',''),2000));
    v_result:=jsonb_build_object('ok',true,'status','SAVED');
  else raise exception 'Unsupported operation type'; end if;

  insert into public.offline_sync_operations(operation_id,hike_id,booking_id,participant_id,operation_type,actor_profile_id,device_id,payload,client_timestamp,result) values(v_operation_id,v_hike_id,v_booking_id,v_participant_id,v_type,p_actor,v_device_id,coalesce(p_operation->'payload','{}'::jsonb),v_client_timestamp,v_result);
  return v_result;
end $$;

revoke all on function public.apply_hike_offline_operation(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.apply_hike_offline_operation(jsonb,uuid) to service_role;

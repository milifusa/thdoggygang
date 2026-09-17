-- Preserve applied-credit history and only restore inventory that was committed by a paid order.
create or replace function public.release_booking_credit(p_booking_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare v_amount integer:=0;
begin
  update public.member_credit_transactions set status='VOID',updated_at=now()
    where booking_id=p_booking_id and kind='BOOKING_USAGE' and status='RESERVED'
    returning abs(amount_cents) into v_amount;
  if v_amount>0 then
    update public.bookings set credit_applied_cents=0,updated_at=now() where id=p_booking_id;
  end if;
  return coalesce(v_amount,0);
end $$;

create or replace function public.cancel_booking_to_credit(
  p_booking_id uuid,
  p_profile_id uuid,
  p_reason text,
  p_actor_profile_id uuid,
  p_enforce_deadline boolean default true
) returns table(credit_amount_cents integer, cancellation_request_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  v_booking public.bookings%rowtype;
  v_hike_start timestamptz;
  v_settings public.cancellation_settings%rowtype;
  v_request_id uuid;
  v_credit integer;
  v_order record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text,0));
  select * into v_booking from public.bookings where id=p_booking_id and profile_id=p_profile_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.status in ('CANCELLED','COMPLETED') then raise exception 'Booking cannot be cancelled'; end if;
  select starts_at into v_hike_start from public.hikes where id=v_booking.hike_id;
  select * into v_settings from public.cancellation_settings where id=1;
  if p_enforce_deadline and now()>v_hike_start-make_interval(hours=>v_settings.minimum_notice_hours) then
    raise exception 'CANCELLATION_DEADLINE_PASSED';
  end if;

  if v_booking.status in ('DRAFT','PENDING_PAYMENT') and not exists(
    select 1 from public.orders o join public.payments p on p.order_id=o.id
    where o.booking_id=v_booking.id and p.status='PAID'
  ) then
    v_credit:=0;
  else
    v_credit:=greatest(v_booking.total_cents,0);
  end if;

  insert into public.booking_cancellation_requests(
    booking_id,requested_by,reason,status,refundable_amount_cents,credit_amount_cents,
    policy_snapshot,notice_hours,resolved_by,resolution_note,resolved_at
  ) values(
    v_booking.id,p_profile_id,p_reason,'CREDITED',0,v_credit,
    v_settings.policy_text,v_settings.minimum_notice_hours,p_actor_profile_id,
    case when v_credit>0 then 'Cancelación convertida en crédito de la manada.' else 'Reservación sin pago cancelada.' end,now()
  ) returning id into v_request_id;

  if v_credit>0 then
    insert into public.member_credit_transactions(
      profile_id,amount_cents,kind,status,booking_id,cancellation_request_id,note,created_by
    ) values(
      p_profile_id,v_credit,'CANCELLATION_CREDIT','POSTED',v_booking.id,v_request_id,
      'Crédito por cancelación dentro de la política',p_actor_profile_id
    );
  end if;

  perform public.release_booking_credit(v_booking.id);
  update public.bookings set status='CANCELLED',cancelled_at=now(),updated_at=now() where id=v_booking.id;
  for v_order in select id from public.orders where booking_id=v_booking.id and status='PAID' loop
    perform public.restore_product_inventory(v_order.id);
  end loop;
  return query select v_credit,v_request_id;
end $$;

revoke all on function public.release_booking_credit(uuid) from public,anon,authenticated;
revoke all on function public.cancel_booking_to_credit(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.release_booking_credit(uuid) to service_role;
grant execute on function public.cancel_booking_to_credit(uuid,uuid,text,uuid,boolean) to service_role;

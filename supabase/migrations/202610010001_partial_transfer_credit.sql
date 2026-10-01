-- Keep bank-transfer reconciliation honest: a rejected partial transfer only
-- becomes credit for the amount that actually reached the bank account.

begin;

alter table public.payments
  add column if not exists received_amount_cents integer
  check (received_amount_cents is null or received_amount_cents >= 0);

create or replace function public.reject_transfer_payment_to_credit(
  p_payment_id uuid,
  p_received_amount_cents integer,
  p_reason text,
  p_actor_profile_id uuid
) returns table(
  result_booking_id uuid,
  result_hike_id uuid,
  credit_amount_cents integer
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_booking public.bookings%rowtype;
  v_request_id uuid;
  v_policy text;
  v_notice_hours integer;
  v_now timestamptz := now();
begin
  if p_received_amount_cents < 0 then
    raise exception 'Received amount cannot be negative';
  end if;
  if length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_payment
  from public.payments
  where id=p_payment_id
  for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.method<>'TRANSFER' then
    raise exception 'Only transfer payments can use this workflow';
  end if;
  if v_payment.received_amount_cents is not null then
    raise exception 'Transfer has already been reconciled';
  end if;
  if v_payment.status<>'UNDER_REVIEW'
    and not (v_payment.status='FAILED' and v_payment.raw_status='booking.cancelled') then
    raise exception 'Transfer is not available for rejection';
  end if;
  if p_received_amount_cents>v_payment.amount_cents then
    raise exception 'Received amount cannot exceed the expected amount';
  end if;
  if v_payment.status='UNDER_REVIEW'
    and p_received_amount_cents=v_payment.amount_cents then
    raise exception 'Approve a transfer when the complete amount was received';
  end if;

  select * into v_order
  from public.orders
  where id=v_payment.order_id
  for update;
  if not found or v_order.booking_id is null then
    raise exception 'Transfer is not linked to a booking';
  end if;

  select * into v_booking
  from public.bookings
  where id=v_order.booking_id
  for update;
  if not found then raise exception 'Booking not found'; end if;

  if exists(
    select 1
    from public.orders o
    join public.payments p on p.order_id=o.id
    where o.booking_id=v_booking.id
      and p.id<>v_payment.id
      and p.status='PAID'
  ) then
    raise exception 'Booking already has a confirmed payment';
  end if;

  update public.payments
  set status='FAILED',
      raw_status='TRANSFER_REJECTED_PARTIAL',
      received_amount_cents=p_received_amount_cents,
      updated_at=v_now
  where id=v_payment.id;

  update public.payment_receipts
  set reviewed_by=p_actor_profile_id,reviewed_at=v_now
  where payment_id=v_payment.id;

  update public.orders
  set status='FAILED',updated_at=v_now
  where id=v_order.id;

  perform public.release_booking_credit(v_booking.id);
  update public.bookings
  set status='CANCELLED',cancelled_at=coalesce(cancelled_at,v_now),updated_at=v_now
  where id=v_booking.id;

  select policy_text,minimum_notice_hours
  into v_policy,v_notice_hours
  from public.cancellation_settings
  where id=1;

  insert into public.booking_cancellation_requests(
    booking_id,requested_by,reason,status,refundable_amount_cents,
    credit_amount_cents,policy_snapshot,notice_hours,resolved_by,
    resolution_note,resolved_at
  ) values(
    v_booking.id,v_booking.profile_id,trim(p_reason),
    case when p_received_amount_cents>0 then 'CREDITED' else 'APPROVED' end,
    0,p_received_amount_cents,
    coalesce(v_policy,'La transferencia incompleta se convierte en crédito únicamente por el importe recibido.'),
    coalesce(v_notice_hours,48),p_actor_profile_id,
    case when p_received_amount_cents>0
      then 'Transferencia incompleta rechazada. Se acreditó únicamente el importe recibido.'
      else 'Transferencia rechazada sin importe recibido.'
    end,
    v_now
  ) returning id into v_request_id;

  if p_received_amount_cents>0 then
    insert into public.member_credit_transactions(
      profile_id,amount_cents,kind,status,booking_id,
      cancellation_request_id,note,created_by
    ) values(
      v_booking.profile_id,p_received_amount_cents,'CANCELLATION_CREDIT','POSTED',
      v_booking.id,v_request_id,
      'Crédito por importe recibido de una transferencia incompleta',
      p_actor_profile_id
    );
  end if;

  insert into public.audit_logs(
    actor_profile_id,action,entity_type,entity_id,metadata
  ) values(
    p_actor_profile_id,'TRANSFER_PAYMENT_REJECTED','payment',v_payment.id,
    jsonb_build_object(
      'booking_id',v_booking.id,
      'expected_amount_cents',v_payment.amount_cents,
      'received_amount_cents',p_received_amount_cents,
      'credit_amount_cents',p_received_amount_cents,
      'reason',trim(p_reason)
    )
  );

  return query
  select v_booking.id,v_booking.hike_id,p_received_amount_cents;
end
$$;

revoke all on function public.reject_transfer_payment_to_credit(uuid,integer,text,uuid)
  from public,anon,authenticated;
grant execute on function public.reject_transfer_payment_to_credit(uuid,integer,text,uuid)
  to service_role;

commit;

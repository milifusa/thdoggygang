-- Cancellation policy and auditable member credits.
create table if not exists public.cancellation_settings (
  id smallint primary key default 1 check (id = 1),
  minimum_notice_hours integer not null default 48 check (minimum_notice_hours between 1 and 720),
  policy_text text not null default 'Puedes cancelar hasta 48 horas antes del inicio. El importe pagado no se devuelve en efectivo: se acredita a tu cuenta para reservar otro hike.',
  late_message text not null default 'Las mochilas están listas, las correas formadas y la ruta ya cuenta tus huellitas. A menos de 48 horas, tu lugar ya está incluido en transporte, equipo y logística, por eso las cancelaciones están cerradas. Si pasó algo extraordinario, escríbenos y lo revisamos contigo.',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.cancellation_settings(id) values (1) on conflict (id) do nothing;

alter table public.bookings
  add column if not exists credit_applied_cents integer not null default 0
  check (credit_applied_cents >= 0);

alter table public.booking_cancellation_requests
  add column if not exists credit_amount_cents integer not null default 0
  check (credit_amount_cents >= 0),
  add column if not exists policy_snapshot text,
  add column if not exists notice_hours integer;

alter table public.booking_cancellation_requests
  drop constraint if exists booking_cancellation_requests_status_check;
alter table public.booking_cancellation_requests
  add constraint booking_cancellation_requests_status_check
  check (status in ('REQUESTED','APPROVED','REJECTED','REFUNDED','CREDITED'));

create table if not exists public.member_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents <> 0),
  kind text not null check (kind in ('CANCELLATION_CREDIT','BOOKING_USAGE','MANUAL_ADJUSTMENT')),
  status text not null default 'POSTED' check (status in ('RESERVED','POSTED','VOID')),
  booking_id uuid references public.bookings(id) on delete set null,
  cancellation_request_id uuid references public.booking_cancellation_requests(id) on delete set null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists member_credit_cancellation_unique
  on public.member_credit_transactions(cancellation_request_id)
  where cancellation_request_id is not null and kind = 'CANCELLATION_CREDIT';
create unique index if not exists member_credit_booking_usage_unique
  on public.member_credit_transactions(booking_id)
  where booking_id is not null and kind = 'BOOKING_USAGE';
create index if not exists member_credit_profile_idx
  on public.member_credit_transactions(profile_id, created_at desc);

alter table public.cancellation_settings enable row level security;
alter table public.member_credit_transactions enable row level security;
revoke all on table public.cancellation_settings from anon, authenticated;
revoke all on table public.member_credit_transactions from anon, authenticated;
grant all on table public.cancellation_settings to service_role;
grant all on table public.member_credit_transactions to service_role;

create or replace function public.reserve_booking_credit(
  p_booking_id uuid,
  p_profile_id uuid,
  p_max_amount_cents integer
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_booking_profile uuid;
  v_booking_status public.booking_status;
  v_existing_id uuid;
  v_existing_amount integer := 0;
  v_available integer := 0;
  v_reserved integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));
  select profile_id,status into v_booking_profile,v_booking_status
    from public.bookings where id=p_booking_id for update;
  if v_booking_profile is null or v_booking_profile<>p_profile_id then raise exception 'Booking not available'; end if;
  if v_booking_status not in ('DRAFT','PENDING_PAYMENT') then raise exception 'Booking cannot use credit'; end if;

  select id,abs(amount_cents) into v_existing_id,v_existing_amount
    from public.member_credit_transactions
    where booking_id=p_booking_id and kind='BOOKING_USAGE' and status in ('RESERVED','POSTED')
    limit 1 for update;
  select coalesce(sum(amount_cents),0) into v_available
    from public.member_credit_transactions
    where profile_id=p_profile_id and status in ('RESERVED','POSTED');
  v_available:=greatest(v_available+v_existing_amount,0);
  v_reserved:=least(greatest(p_max_amount_cents,0),v_available);

  if v_reserved=0 then
    if v_existing_id is not null then
      update public.member_credit_transactions set status='VOID',updated_at=now() where id=v_existing_id;
    end if;
  elsif v_existing_id is not null then
    update public.member_credit_transactions
      set amount_cents=-v_reserved,status='RESERVED',updated_at=now() where id=v_existing_id;
  else
    insert into public.member_credit_transactions(profile_id,amount_cents,kind,status,booking_id,note)
      values(p_profile_id,-v_reserved,'BOOKING_USAGE','RESERVED',p_booking_id,'Crédito reservado para esta aventura');
  end if;
  update public.bookings set credit_applied_cents=v_reserved,updated_at=now() where id=p_booking_id;
  return v_reserved;
end $$;

create or replace function public.commit_booking_credit(p_booking_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare v_amount integer:=0;
begin
  update public.member_credit_transactions set status='POSTED',updated_at=now()
    where booking_id=p_booking_id and kind='BOOKING_USAGE' and status='RESERVED'
    returning abs(amount_cents) into v_amount;
  return coalesce(v_amount,(select credit_applied_cents from public.bookings where id=p_booking_id),0);
end $$;

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

revoke all on function public.reserve_booking_credit(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.commit_booking_credit(uuid) from public,anon,authenticated;
revoke all on function public.release_booking_credit(uuid) from public,anon,authenticated;
revoke all on function public.cancel_booking_to_credit(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_booking_credit(uuid,uuid,integer) to service_role;
grant execute on function public.commit_booking_credit(uuid) to service_role;
grant execute on function public.release_booking_credit(uuid) to service_role;
grant execute on function public.cancel_booking_to_credit(uuid,uuid,text,uuid,boolean) to service_role;

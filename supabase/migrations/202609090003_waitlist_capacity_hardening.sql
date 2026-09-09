-- Treat active waitlist offers as short-lived capacity holds and keep booking writes atomic.
create or replace function public.public_hike_availability(p_hike_ids uuid[])
returns table(hike_id uuid, spots_left integer)
language sql stable security definer set search_path=public as $$
  select h.id,
    greatest(0,h.capacity-count(bp.id)::integer-coalesce((
      select sum(w.people_count)::integer from public.waitlist_entries w
      where w.hike_id=h.id and w.status='OFFERED' and w.offer_expires_at>now()
    ),0)) as spots_left
  from public.hikes h
  left join public.bookings b on b.hike_id=h.id and b.status in ('PENDING_PAYMENT','CONFIRMED')
  left join public.booking_participants bp on bp.booking_id=b.id
  where h.id=any(p_hike_ids) and h.published=true and h.deleted_at is null
  group by h.id,h.capacity
$$;
revoke all on function public.public_hike_availability(uuid[]) from public;
grant execute on function public.public_hike_availability(uuid[]) to anon,authenticated;

create or replace function public.enforce_hike_participant_capacity() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_booking public.bookings%rowtype;
declare v_capacity integer;
declare v_reserved integer;
declare v_current integer;
declare v_held integer;
begin
  select * into v_booking from public.bookings where id=new.booking_id;
  if not found or v_booking.status not in ('DRAFT','PENDING_PAYMENT','CONFIRMED') then return new; end if;
  select capacity into v_capacity from public.hikes where id=v_booking.hike_id for update;
  select count(*)::integer into v_reserved
  from public.booking_participants bp join public.bookings b on b.id=bp.booking_id
  where b.hike_id=v_booking.hike_id and b.id<>v_booking.id and b.status in ('PENDING_PAYMENT','CONFIRMED');
  select count(*)::integer into v_current from public.booking_participants where booking_id=v_booking.id;
  select coalesce(sum(people_count),0)::integer into v_held from public.waitlist_entries
  where hike_id=v_booking.hike_id and status='OFFERED' and offer_expires_at>now() and profile_id<>v_booking.profile_id;
  if v_reserved+v_current+v_held>=v_capacity then raise exception 'No hay cupo suficiente. Únete a la lista de espera.'; end if;
  return new;
end $$;
drop trigger if exists booking_participants_capacity_guard on public.booking_participants;
create trigger booking_participants_capacity_guard before insert on public.booking_participants
for each row execute function public.enforce_hike_participant_capacity();

create or replace function public.enforce_booking_capacity_transition() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_capacity integer;
declare v_max_dogs integer;
declare v_reserved integer;
declare v_selected integer;
declare v_reserved_dogs integer;
declare v_selected_dogs integer;
declare v_held integer;
begin
  if new.status not in ('PENDING_PAYMENT','CONFIRMED') or new.status=old.status then return new; end if;
  select capacity,max_dogs into v_capacity,v_max_dogs from public.hikes where id=new.hike_id for update;
  select count(*)::integer into v_reserved from public.booking_participants bp join public.bookings b on b.id=bp.booking_id where b.hike_id=new.hike_id and b.id<>new.id and b.status in ('PENDING_PAYMENT','CONFIRMED');
  select count(*)::integer into v_selected from public.booking_participants where booking_id=new.id;
  select coalesce(sum(people_count),0)::integer into v_held from public.waitlist_entries where hike_id=new.hike_id and status='OFFERED' and offer_expires_at>now() and profile_id<>new.profile_id;
  if v_reserved+v_selected+v_held>v_capacity then raise exception 'No hay cupo suficiente. Únete a la lista de espera.'; end if;
  if v_max_dogs is not null then
    select count(*)::integer into v_reserved_dogs from public.booking_dogs bd join public.bookings b on b.id=bd.booking_id where b.hike_id=new.hike_id and b.id<>new.id and b.status in ('PENDING_PAYMENT','CONFIRMED');
    select count(*)::integer into v_selected_dogs from public.booking_dogs where booking_id=new.id;
    if v_reserved_dogs+v_selected_dogs>v_max_dogs then raise exception 'No hay cupo suficiente para más perritos.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_capacity_transition_guard on public.bookings;
create trigger bookings_capacity_transition_guard before update of status on public.bookings
for each row execute function public.enforce_booking_capacity_transition();

create or replace function public.offer_next_waitlist_member() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_entry public.waitlist_entries%rowtype;
declare v_slug text;
declare v_name text;
declare v_spots integer;
begin
  if new.status='CANCELLED' and old.status in ('PENDING_PAYMENT','CONFIRMED') then
    select a.spots_left into v_spots from public.public_hike_availability(array[new.hike_id]) a limit 1;
    select * into v_entry from public.waitlist_entries
    where hike_id=new.hike_id and status='WAITING' and people_count<=coalesce(v_spots,0)
    order by created_at for update skip locked limit 1;
    if found then
      update public.waitlist_entries set status='OFFERED',offer_expires_at=now()+interval '24 hours'
      where id=v_entry.id;
      select slug,name into v_slug,v_name from public.hikes where id=new.hike_id;
      insert into public.notifications(profile_id,channel,template_key,payload,status,sent_at)
      values(v_entry.profile_id,'IN_APP','WAITLIST_OFFER',jsonb_build_object('hike',v_name,'url','/reservar/'||v_slug,'expiresAt',now()+interval '24 hours'),'SENT',now());
    end if;
  end if;
  return new;
end $$;

create or replace function public.convert_waitlist_on_confirmation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('PENDING_PAYMENT','CONFIRMED') and old.status is distinct from new.status then
    update public.waitlist_entries set status='CONVERTED'
    where hike_id=new.hike_id and profile_id=new.profile_id and status in ('WAITING','OFFERED');
  end if;
  return new;
end $$;

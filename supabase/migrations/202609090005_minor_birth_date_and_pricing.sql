-- Minor profiles require a birth date. Children under five attend hikes free;
-- age is calculated on the local date of the hike, not on checkout day.

begin;

alter table public.person_profiles
  add constraint person_profiles_minor_birth_date_required
  check (not is_minor or birth_date is not null) not valid;

alter table public.person_profiles
  validate constraint person_profiles_minor_birth_date_required;

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
  v_reserved_people integer := 0;
  v_reserved_dogs integer := 0;
  v_billable_people integer := 0;
  v_hike_date date;
begin
  if v_profile_id is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_person_ids,1),0)=0 then raise exception 'At least one person is required'; end if;

  select * into v_hike from public.hikes
  where slug=p_hike_slug and published and deleted_at is null;
  if not found then raise exception 'Hike not found'; end if;
  v_hike_date := (v_hike.starts_at at time zone 'America/Mexico_City')::date;

  if exists(
    select 1 from unnest(p_person_ids) selected(id)
    left join public.person_profiles p
      on p.id=selected.id
      and p.owner_profile_id=v_profile_id
      and p.deleted_at is null
    where p.id is null
  ) then raise exception 'Invalid participant'; end if;
  if exists(
    select 1 from public.person_profiles p
    where p.id=any(p_person_ids)
      and p.is_minor
      and (p.birth_date is null or p.birth_date > v_hike_date)
  ) then raise exception 'Minor birth date required or invalid'; end if;
  if exists(
    select 1 from public.person_profiles p
    where p.id=any(p_person_ids)
      and p.is_minor
      and (p.guardian_person_id is null or not p.guardian_person_id=any(p_person_ids))
  ) then raise exception 'Every minor requires a selected guardian'; end if;
  if exists(
    select 1 from unnest(p_dog_ids) selected(id)
    left join public.dogs d
      on d.id=selected.id
      and d.owner_profile_id=v_profile_id
      and d.deleted_at is null
    where d.id is null
  ) then raise exception 'Invalid dog'; end if;
  if exists(
    select 1 from unnest(p_transport_person_ids) selected(id)
    where not selected.id=any(p_person_ids)
  ) then raise exception 'Transport participant must be in booking'; end if;

  if p_booking_id is null then
    insert into public.bookings(booking_number,profile_id,hike_id,status)
    values(
      'TDG-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
      v_profile_id,
      v_hike.id,
      'DRAFT'
    ) returning id into v_booking_id;
  else
    select id into v_booking_id from public.bookings
    where id=p_booking_id
      and profile_id=v_profile_id
      and status in ('DRAFT','PENDING_PAYMENT')
    for update;
    if not found then raise exception 'Draft not found'; end if;
  end if;

  select count(*)::integer into v_reserved_people
  from public.booking_participants bp
  join public.bookings b on b.id=bp.booking_id
  where b.hike_id=v_hike.id
    and b.id<>v_booking_id
    and b.status in ('PENDING_PAYMENT','CONFIRMED');
  select count(*)::integer into v_reserved_dogs
  from public.booking_dogs bd
  join public.bookings b on b.id=bd.booking_id
  where b.hike_id=v_hike.id
    and b.id<>v_booking_id
    and b.status in ('PENDING_PAYMENT','CONFIRMED');
  if v_reserved_people+cardinality(p_person_ids)>v_hike.capacity then
    raise exception 'No hay cupo suficiente. Únete a la lista de espera.';
  end if;
  if v_hike.max_dogs is not null and v_reserved_dogs+cardinality(p_dog_ids)>v_hike.max_dogs then
    raise exception 'No hay cupo suficiente para más perritos.';
  end if;

  delete from public.signed_waivers where booking_id=v_booking_id;
  delete from public.transport_reservations where booking_id=v_booking_id;
  delete from public.booking_participants where booking_id=v_booking_id;
  delete from public.booking_dogs where booking_id=v_booking_id;

  insert into public.booking_participants(booking_id,person_profile_id,snapshot)
  select
    v_booking_id,
    p.id,
    jsonb_build_object(
      'first_name',p.first_name,
      'last_name',p.last_name,
      'email',p.email,
      'phone',p.phone,
      'whatsapp',p.whatsapp,
      'birth_date',p.birth_date,
      'is_minor',p.is_minor,
      'guardian_person_id',p.guardian_person_id,
      'emergency_contact_name',p.emergency_contact_name,
      'emergency_contact_phone',p.emergency_contact_phone
    )
  from public.person_profiles p
  where p.id=any(p_person_ids) and p.owner_profile_id=v_profile_id;

  update public.booking_participants minor
  set guardian_booking_participant_id=guardian.id
  from public.person_profiles source,public.booking_participants guardian
  where minor.booking_id=v_booking_id
    and source.id=minor.person_profile_id
    and source.guardian_person_id=guardian.person_profile_id
    and guardian.booking_id=v_booking_id;

  insert into public.booking_dogs(booking_id,dog_id,snapshot)
  select
    v_booking_id,
    d.id,
    jsonb_build_object(
      'name',d.name,
      'breed',d.breed,
      'birth_date',d.birth_date,
      'sex',d.sex,
      'size',d.size,
      'sociability',d.sociability,
      'reactivity',d.reactivity,
      'medical_conditions',d.medical_conditions,
      'medications',d.medications,
      'notes',d.notes,
      'activity_level',d.activity_level,
      'hiking_experience',d.hiking_experience,
      'vaccination_current',d.vaccination_current,
      'vet_cleared',d.vet_cleared
    )
  from public.dogs d
  where d.id=any(p_dog_ids) and d.owner_profile_id=v_profile_id;

  select case when tc.mode='INCLUDED' then 0 else tc.price_cents end
  into v_transport_price
  from public.transport_configurations tc
  where tc.hike_id=v_hike.id;
  v_transport_price:=coalesce(v_transport_price,0);

  insert into public.transport_reservations(
    booking_id,
    booking_participant_id,
    price_cents,
    dog_ids
  )
  select v_booking_id,bp.id,v_transport_price,p_dog_ids
  from public.booking_participants bp
  where bp.booking_id=v_booking_id
    and bp.person_profile_id=any(p_transport_person_ids);

  select count(*)::integer into v_billable_people
  from public.person_profiles p
  where p.id=any(p_person_ids)
    and p.owner_profile_id=v_profile_id
    and (
      not p.is_minor
      or p.birth_date <= (v_hike_date - interval '5 years')::date
    );

  if v_hike.pricing_mode='PERSON_DOG_BUNDLE' then
    v_hike_total:=v_billable_people*v_hike.price_cents
      +greatest(cardinality(p_dog_ids)-v_billable_people,0)*v_hike.dog_price_cents;
  else
    v_hike_total:=v_billable_people*v_hike.price_cents
      +cardinality(p_dog_ids)*v_hike.dog_price_cents;
  end if;
  v_total:=v_hike_total+cardinality(p_transport_person_ids)*v_transport_price;
  update public.bookings
  set subtotal_cents=v_total,total_cents=v_total,updated_at=now()
  where id=v_booking_id;
  return v_booking_id;
end $$;

revoke all on function public.save_booking_draft(text,uuid,uuid[],uuid[],uuid[]) from public,anon;
grant execute on function public.save_booking_draft(text,uuid,uuid[],uuid[],uuid[]) to authenticated;

commit;

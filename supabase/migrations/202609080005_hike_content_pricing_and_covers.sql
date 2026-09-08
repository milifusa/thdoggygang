-- Per-hike public content, configurable pricing and public cover uploads.
alter table public.hikes
  add column if not exists pricing_mode text not null default 'PER_PERSON'
    check (pricing_mode in ('PER_PERSON', 'PERSON_DOG_BUNDLE')),
  add column if not exists dog_price_cents integer not null default 0
    check (dog_price_cents >= 0),
  add column if not exists dog_suitability text;

update public.hikes
set dog_suitability = coalesce(
  dog_suitability,
  'Recomendada para perros sociables, sanos y con condición para caminar al menos 2.5 horas. Tamaños pequeños bien acondicionados también son bienvenidos.'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hike-covers', 'hike-covers', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hike_covers_public_read on storage.objects;
create policy hike_covers_public_read on storage.objects
for select using (bucket_id = 'hike-covers');

drop policy if exists hike_covers_admin_insert on storage.objects;
create policy hike_covers_admin_insert on storage.objects
for insert with check (bucket_id = 'hike-covers' and public.current_role() = 'ADMIN');

drop policy if exists hike_covers_admin_update on storage.objects;
create policy hike_covers_admin_update on storage.objects
for update using (bucket_id = 'hike-covers' and public.current_role() = 'ADMIN')
with check (bucket_id = 'hike-covers' and public.current_role() = 'ADMIN');

drop policy if exists hike_covers_admin_delete on storage.objects;
create policy hike_covers_admin_delete on storage.objects
for delete using (bucket_id = 'hike-covers' and public.current_role() = 'ADMIN');

create or replace function public.save_booking_draft(
  p_hike_slug text,
  p_booking_id uuid,
  p_person_ids uuid[],
  p_dog_ids uuid[],
  p_transport_person_ids uuid[] default '{}'
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_hike public.hikes%rowtype;
  v_booking_id uuid;
  v_transport_price integer := 0;
  v_hike_total integer := 0;
  v_total integer;
begin
  if v_profile_id is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_person_ids, 1), 0) = 0 then raise exception 'At least one person is required'; end if;

  select * into v_hike from public.hikes where slug = p_hike_slug and published and deleted_at is null for share;
  if not found then raise exception 'Hike not found'; end if;

  if exists (select 1 from unnest(p_person_ids) selected(id) left join public.person_profiles p on p.id = selected.id and p.owner_profile_id = v_profile_id and p.deleted_at is null where p.id is null) then raise exception 'Invalid participant'; end if;
  if exists (select 1 from unnest(p_dog_ids) selected(id) left join public.dogs d on d.id = selected.id and d.owner_profile_id = v_profile_id and d.deleted_at is null where d.id is null) then raise exception 'Invalid dog'; end if;
  if exists (select 1 from unnest(p_transport_person_ids) selected(id) where not selected.id = any(p_person_ids)) then raise exception 'Transport participant must be in booking'; end if;

  if p_booking_id is null then
    insert into public.bookings (booking_number, profile_id, hike_id, status)
    values ('TDG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), v_profile_id, v_hike.id, 'DRAFT')
    returning id into v_booking_id;
  else
    select id into v_booking_id from public.bookings where id = p_booking_id and profile_id = v_profile_id and status in ('DRAFT','PENDING_PAYMENT') for update;
    if not found then raise exception 'Draft not found'; end if;
  end if;

  delete from public.signed_waivers where booking_id = v_booking_id;
  delete from public.transport_reservations where booking_id = v_booking_id;
  delete from public.booking_participants where booking_id = v_booking_id;
  delete from public.booking_dogs where booking_id = v_booking_id;

  insert into public.booking_participants (booking_id, person_profile_id, snapshot)
  select v_booking_id, p.id, jsonb_build_object(
    'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'phone', p.phone,
    'birth_date', p.birth_date, 'is_minor', p.is_minor, 'emergency_contact_name', p.emergency_contact_name,
    'emergency_contact_phone', p.emergency_contact_phone
  ) from public.person_profiles p where p.id = any(p_person_ids) and p.owner_profile_id = v_profile_id;

  insert into public.booking_dogs (booking_id, dog_id, snapshot)
  select v_booking_id, d.id, jsonb_build_object(
    'name', d.name, 'breed', d.breed, 'birth_date', d.birth_date, 'sex', d.sex, 'size', d.size,
    'sociability', d.sociability, 'reactivity', d.reactivity, 'medical_conditions', d.medical_conditions,
    'medications', d.medications, 'notes', d.notes
  ) from public.dogs d where d.id = any(p_dog_ids) and d.owner_profile_id = v_profile_id;

  select case when tc.mode = 'INCLUDED' then 0 else tc.price_cents end into v_transport_price
  from public.transport_configurations tc where tc.hike_id = v_hike.id;
  v_transport_price := coalesce(v_transport_price, 0);

  insert into public.transport_reservations (booking_id, booking_participant_id, price_cents, dog_ids)
  select v_booking_id, bp.id, v_transport_price, p_dog_ids
  from public.booking_participants bp
  where bp.booking_id = v_booking_id and bp.person_profile_id = any(p_transport_person_ids);

  if v_hike.pricing_mode = 'PERSON_DOG_BUNDLE' then
    v_hike_total := cardinality(p_person_ids) * v_hike.price_cents
      + greatest(cardinality(p_dog_ids) - cardinality(p_person_ids), 0) * v_hike.dog_price_cents;
  else
    v_hike_total := cardinality(p_person_ids) * v_hike.price_cents
      + cardinality(p_dog_ids) * v_hike.dog_price_cents;
  end if;
  v_total := v_hike_total + cardinality(p_transport_person_ids) * v_transport_price;
  update public.bookings set subtotal_cents = v_total, total_cents = v_total, updated_at = now() where id = v_booking_id;
  return v_booking_id;
end $$;

grant execute on function public.save_booking_draft(text, uuid, uuid[], uuid[], uuid[]) to authenticated;

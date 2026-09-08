-- Atomic booking drafts, auth bootstrap and webhook idempotency.
create table public.payment_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  unique (provider, event_id)
);
alter table public.payment_webhook_events enable row level security;
create policy webhook_events_admin_read on public.payment_webhook_events for select using (public.current_role() = 'ADMIN');
alter table public.orders add constraint orders_booking_unique unique (booking_id);
alter table public.booking_checkin_tokens add column if not exists token_ciphertext text;
create policy signed_waivers_owner_delete_draft on public.signed_waivers for delete using (
  exists(select 1 from public.bookings b where b.id = booking_id and b.profile_id = public.current_profile_id() and b.status in ('DRAFT','PENDING_PAYMENT'))
);

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
declare new_profile_id uuid;
begin
  insert into public.profiles (auth_user_id, first_name, last_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', split_part(coalesce(new.email, 'Amigo'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    new.phone
  ) returning id into new_profile_id;
  insert into public.person_profiles (owner_profile_id, first_name, last_name, email, phone, birth_date, is_minor)
  values (
    new_profile_id,
    coalesce(new.raw_user_meta_data->>'first_name', split_part(coalesce(new.email, 'Amigo'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    new.phone,
    null,
    false
  );
  return new;
end $$;

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

  v_total := cardinality(p_person_ids) * v_hike.price_cents + cardinality(p_transport_person_ids) * v_transport_price;
  update public.bookings set subtotal_cents = v_total, total_cents = v_total, updated_at = now() where id = v_booking_id;
  return v_booking_id;
end $$;

grant execute on function public.save_booking_draft(text, uuid, uuid[], uuid[], uuid[]) to authenticated;

insert into public.waiver_templates (id, name) values ('00000000-0000-4000-8000-000000000101', 'Responsiva general de aventura') on conflict (id) do nothing;
insert into public.waiver_versions (id, template_id, version, body, body_hash)
values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 1,
  'Declaro que participo voluntariamente, que la información proporcionada es correcta y que seguiré las indicaciones de seguridad, cuidado del entorno y bienestar de los perritos.',
  encode(digest('Responsiva general de aventura v1', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into public.hikes (slug, name, description, starts_at, location_name, price_cents, capacity, max_dogs, distance_km, elevation_m, duration_minutes, difficulty, terrain, recommended_dog_sizes, includes, packing_list, rules, cancellation_policy, cover_path, published)
values
  ('sendero-del-duende','Sendero del Duende','Un sendero entre bosque, vistas abiertas y rincones que parecen salidos de un cuento.','2026-09-20 07:00:00-06','Cholula, Puebla',35000,40,32,8,320,150,'Fácil / media','Bosque y sendero',array['SMALL','MEDIUM','LARGE'],array['Guías','Kit de bienvenida','Hidratación','Galería digital'],array['Correa fija','Agua','Calzado con tracción','Bolsitas'],'Todos los perritos deben permanecer con correa.','Transferible hasta 72 horas antes.','sendero-del-duende/cover.jpg',true),
  ('bosque-de-las-nubes','Bosque de las Nubes','Una caminata fresca entre neblina, pinos y tierra húmeda.','2026-10-05 06:30:00-06','Zacatlán, Puebla',49000,30,24,11,560,240,'Media','Bosque húmedo',array['MEDIUM','LARGE'],array['Guías','Hidratación','Galería digital'],array['Correa fija','Agua','Impermeable'],'Todos los perritos deben permanecer con correa.','Transferible hasta 72 horas antes.','bosque-de-las-nubes/cover.jpg',true),
  ('amanecer-en-izta','Amanecer en Izta','Madrugamos para ver cómo la montaña se enciende.','2026-10-19 05:30:00-06','Amecameca, Estado de México',62000,24,18,6,440,180,'Media','Alta montaña',array['MEDIUM','LARGE'],array['Guías','Hidratación','Galería digital'],array['Correa fija','Agua','Abrigo'],'Todos los perritos deben permanecer con correa.','Transferible hasta 72 horas antes.','amanecer-en-izta/cover.jpg',true)
on conflict (slug) do update set name = excluded.name, description = excluded.description, starts_at = excluded.starts_at, price_cents = excluded.price_cents, published = excluded.published;

insert into public.transport_configurations (hike_id, mode, capacity, price_cents, departure_place, departure_at, return_details, rules)
select id, 'OPTIONAL', 24, 20000, 'Angelópolis', starts_at - interval '90 minutes', 'Regreso al finalizar la caminata', 'Perritos con transportadora o cinturón de seguridad según tamaño.' from public.hikes where slug = 'sendero-del-duende'
on conflict (hike_id) do update set mode = excluded.mode, capacity = excluded.capacity, price_cents = excluded.price_cents;

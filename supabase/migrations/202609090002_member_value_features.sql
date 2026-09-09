-- Member value features: adventure center, waitlist, passport, rewards,
-- verified reviews, preferences and dog compatibility data.

alter table public.dogs
  add column if not exists activity_level text,
  add column if not exists hiking_experience text,
  add column if not exists vaccination_current boolean,
  add column if not exists vet_cleared boolean;

alter table public.dogs drop constraint if exists dogs_activity_level_check;
alter table public.dogs add constraint dogs_activity_level_check
  check (activity_level is null or activity_level in ('LOW','MEDIUM','HIGH'));
alter table public.dogs drop constraint if exists dogs_hiking_experience_check;
alter table public.dogs add constraint dogs_hiking_experience_check
  check (hiking_experience is null or hiking_experience in ('FIRST_TIME','SOME','EXPERIENCED'));

alter table public.hikes
  add column if not exists meeting_lat numeric(9,6),
  add column if not exists meeting_lng numeric(9,6);

alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles(id);

create unique index if not exists profiles_referral_code_unique
  on public.profiles(referral_code) where referral_code is not null;

create or replace function public.assign_referral_code() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.referral_code is null or btrim(new.referral_code)='' then
    new.referral_code := upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  return new;
end $$;

drop trigger if exists profiles_assign_referral_code on public.profiles;
create trigger profiles_assign_referral_code before insert on public.profiles
for each row execute function public.assign_referral_code();

update public.profiles
set referral_code=upper(substr(replace(id::text,'-',''),1,8))
where referral_code is null;

create or replace function public.redeem_referral_code(p_code text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_member uuid := public.current_profile_id();
declare v_referrer uuid;
begin
  if v_member is null then raise exception 'Not authenticated'; end if;
  select id into v_referrer from public.profiles
  where referral_code=upper(btrim(p_code)) and active=true and deleted_at is null;
  if v_referrer is null or v_referrer=v_member then return false; end if;
  if exists(select 1 from public.bookings where profile_id=v_member and status='COMPLETED') then return false; end if;
  perform set_config('app.redeeming_referral','true',true);
  update public.profiles set referred_by=v_referrer where id=v_member and referred_by is null;
  return found;
end $$;
revoke all on function public.redeem_referral_code(text) from public,anon;
grant execute on function public.redeem_referral_code(text) to authenticated;

create or replace function public.protect_profile_referrals() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.referral_code is distinct from old.referral_code
    and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    and public.current_role()<>'ADMIN' then
    raise exception 'Referral codes cannot be changed';
  end if;
  if new.referred_by is distinct from old.referred_by
    and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    and public.current_role()<>'ADMIN'
    and coalesce(current_setting('app.redeeming_referral',true),'')<>'true' then
    raise exception 'Use the referral redemption flow';
  end if;
  if new.referred_by=new.id then raise exception 'Self referral is not allowed'; end if;
  return new;
end $$;
drop trigger if exists profiles_protect_referrals on public.profiles;
create trigger profiles_protect_referrals before update on public.profiles
for each row execute function public.protect_profile_referrals();

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null references public.hikes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  people_count integer not null default 1 check (people_count between 1 and 12),
  dog_count integer not null default 1 check (dog_count between 0 and 12),
  status text not null default 'WAITING'
    check (status in ('WAITING','OFFERED','CONVERTED','EXPIRED','CANCELLED')),
  offer_expires_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists waitlist_one_active_per_member_hike
  on public.waitlist_entries(hike_id,profile_id)
  where status in ('WAITING','OFFERED');
create index if not exists waitlist_hike_position_idx
  on public.waitlist_entries(hike_id,status,created_at);

create or replace function public.offer_next_waitlist_member() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_entry public.waitlist_entries%rowtype;
declare v_slug text;
declare v_name text;
begin
  if new.status='CANCELLED' and old.status in ('PENDING_PAYMENT','CONFIRMED') then
    select * into v_entry from public.waitlist_entries
    where hike_id=new.hike_id and status='WAITING'
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
drop trigger if exists bookings_offer_waitlist on public.bookings;
create trigger bookings_offer_waitlist after update of status on public.bookings
for each row execute function public.offer_next_waitlist_member();

create or replace function public.public_hike_availability(p_hike_ids uuid[])
returns table(hike_id uuid, spots_left integer)
language sql stable security definer set search_path=public as $$
  select h.id,
    greatest(0,h.capacity-count(bp.id)::integer) as spots_left
  from public.hikes h
  left join public.bookings b on b.hike_id=h.id and b.status in ('PENDING_PAYMENT','CONFIRMED')
  left join public.booking_participants bp on bp.booking_id=b.id
  where h.id=any(p_hike_ids) and h.published=true and h.deleted_at is null
  group by h.id,h.capacity
$$;
revoke all on function public.public_hike_availability(uuid[]) from public;
grant execute on function public.public_hike_availability(uuid[]) to anon,authenticated;

create table if not exists public.adventure_checklist_items (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null check (item_key in ('GEAR','WATER','FOOD','ID','DOG_TAG','VACCINES','ROUTE_SAVED')),
  completed_at timestamptz not null default now(),
  primary key (booking_id,profile_id,item_key)
);

create table if not exists public.member_notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  reminder_7d boolean not null default true,
  reminder_1d boolean not null default true,
  route_changes boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.hike_reviews (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null references public.hikes(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  route_rating integer not null check (route_rating between 1 and 5),
  guide_rating integer not null check (guide_rating between 1 and 5),
  transport_rating integer check (transport_rating is null or transport_rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1200),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hike_reviews_public_idx
  on public.hike_reviews(hike_id,published,created_at desc);

create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check (points <> 0),
  reason text not null check (reason in ('HIKE_COMPLETED','REFERRAL_COMPLETED','REFERRED_WELCOME','ADMIN_ADJUSTMENT')),
  entity_type text,
  entity_id text,
  description text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists reward_ledger_idempotency_idx
  on public.reward_ledger(profile_id,reason,coalesce(entity_id,''));
create index if not exists reward_ledger_profile_idx
  on public.reward_ledger(profile_id,created_at desc);

create or replace function public.award_completed_booking_rewards() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_first_completion boolean;
declare v_referrer uuid;
begin
  if new.status='COMPLETED' and old.status is distinct from 'COMPLETED' then
    insert into public.reward_ledger(profile_id,points,reason,entity_type,entity_id,description)
    values(new.profile_id,100,'HIKE_COMPLETED','booking',new.id::text,'Aventura completada')
    on conflict do nothing;

    select count(*)=1 into v_first_completion
    from public.bookings where profile_id=new.profile_id and status='COMPLETED';
    select referred_by into v_referrer from public.profiles where id=new.profile_id;
    if v_first_completion and v_referrer is not null then
      insert into public.reward_ledger(profile_id,points,reason,entity_type,entity_id,description)
      values
        (v_referrer,150,'REFERRAL_COMPLETED','profile',new.profile_id::text,'Tu invitado completó su primera aventura'),
        (new.profile_id,75,'REFERRED_WELCOME','profile',v_referrer::text,'Bono de bienvenida por invitación')
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bookings_award_rewards on public.bookings;
create trigger bookings_award_rewards after update of status on public.bookings
for each row execute function public.award_completed_booking_rewards();

insert into public.reward_ledger(profile_id,points,reason,entity_type,entity_id,description)
select profile_id,100,'HIKE_COMPLETED','booking',id::text,'Aventura completada'
from public.bookings where status='COMPLETED'
on conflict do nothing;

drop trigger if exists waitlist_entries_updated on public.waitlist_entries;
create trigger waitlist_entries_updated before update on public.waitlist_entries
for each row execute function public.set_updated_at();
drop trigger if exists member_notification_preferences_updated on public.member_notification_preferences;
create trigger member_notification_preferences_updated before update on public.member_notification_preferences
for each row execute function public.set_updated_at();
drop trigger if exists hike_reviews_updated on public.hike_reviews;
create trigger hike_reviews_updated before update on public.hike_reviews
for each row execute function public.set_updated_at();

alter table public.waitlist_entries enable row level security;
alter table public.adventure_checklist_items enable row level security;
alter table public.member_notification_preferences enable row level security;
alter table public.hike_reviews enable row level security;
alter table public.reward_ledger enable row level security;

create policy waitlist_owner_read on public.waitlist_entries for select
  using (profile_id=public.current_profile_id() or public.current_role()='ADMIN');
create policy waitlist_owner_insert on public.waitlist_entries for insert
  with check (profile_id=public.current_profile_id());
create policy waitlist_owner_cancel on public.waitlist_entries for update
  using (profile_id=public.current_profile_id() and status in ('WAITING','OFFERED'))
  with check (profile_id=public.current_profile_id() and status='CANCELLED');
create policy waitlist_admin_update on public.waitlist_entries for update
  using (public.current_role()='ADMIN') with check (public.current_role()='ADMIN');

create policy checklist_owner_all on public.adventure_checklist_items for all
  using (profile_id=public.current_profile_id() and exists(
    select 1 from public.bookings b where b.id=booking_id and b.profile_id=public.current_profile_id()
  ) or public.current_role()='ADMIN')
  with check (profile_id=public.current_profile_id() and exists(
    select 1 from public.bookings b where b.id=booking_id and b.profile_id=public.current_profile_id()
  ) or public.current_role()='ADMIN');

create policy notification_preferences_owner_all on public.member_notification_preferences for all
  using (profile_id=public.current_profile_id() or public.current_role()='ADMIN')
  with check (profile_id=public.current_profile_id() or public.current_role()='ADMIN');

create policy hike_reviews_public_read on public.hike_reviews for select
  using (published or profile_id=public.current_profile_id() or public.current_role()='ADMIN');
create policy hike_reviews_owner_insert on public.hike_reviews for insert
  with check (profile_id=public.current_profile_id() and exists(
    select 1 from public.bookings b
    join public.hikes h on h.id=b.hike_id
    where b.id=hike_reviews.booking_id and b.profile_id=public.current_profile_id()
      and b.hike_id=hike_reviews.hike_id and b.status in ('CONFIRMED','COMPLETED') and h.starts_at<now()
  ));
create policy hike_reviews_owner_update on public.hike_reviews for update
  using (profile_id=public.current_profile_id())
  with check (profile_id=public.current_profile_id() and exists(
    select 1 from public.bookings b join public.hikes h on h.id=b.hike_id
    where b.id=hike_reviews.booking_id and b.profile_id=public.current_profile_id()
      and b.hike_id=hike_reviews.hike_id and b.status in ('CONFIRMED','COMPLETED') and h.starts_at<now()
  ));
create policy hike_reviews_admin_update on public.hike_reviews for update
  using (public.current_role()='ADMIN') with check (public.current_role()='ADMIN');

create policy reward_ledger_owner_read on public.reward_ledger for select
  using (profile_id=public.current_profile_id() or public.current_role()='ADMIN');

revoke all on table public.reward_ledger from anon;
revoke insert,update,delete on table public.reward_ledger from authenticated;

-- Keep capacity enforcement and dog assessment snapshots atomic with draft saves.
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
begin
  if v_profile_id is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_person_ids,1),0)=0 then raise exception 'At least one person is required'; end if;
  select * into v_hike from public.hikes where slug=p_hike_slug and published and deleted_at is null for update;
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

  select count(*)::integer into v_reserved_people from public.booking_participants bp join public.bookings b on b.id=bp.booking_id where b.hike_id=v_hike.id and b.id<>v_booking_id and b.status in ('PENDING_PAYMENT','CONFIRMED');
  select count(*)::integer into v_reserved_dogs from public.booking_dogs bd join public.bookings b on b.id=bd.booking_id where b.hike_id=v_hike.id and b.id<>v_booking_id and b.status in ('PENDING_PAYMENT','CONFIRMED');
  if v_reserved_people+cardinality(p_person_ids)>v_hike.capacity then raise exception 'No hay cupo suficiente. Únete a la lista de espera.'; end if;
  if v_hike.max_dogs is not null and v_reserved_dogs+cardinality(p_dog_ids)>v_hike.max_dogs then raise exception 'No hay cupo suficiente para más perritos.'; end if;

  delete from public.signed_waivers where booking_id=v_booking_id;
  delete from public.transport_reservations where booking_id=v_booking_id;
  delete from public.booking_participants where booking_id=v_booking_id;
  delete from public.booking_dogs where booking_id=v_booking_id;
  insert into public.booking_participants(booking_id,person_profile_id,snapshot)
  select v_booking_id,p.id,jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'email',p.email,'phone',p.phone,'whatsapp',p.whatsapp,'birth_date',p.birth_date,'is_minor',p.is_minor,'guardian_person_id',p.guardian_person_id,'emergency_contact_name',p.emergency_contact_name,'emergency_contact_phone',p.emergency_contact_phone)
  from public.person_profiles p where p.id=any(p_person_ids) and p.owner_profile_id=v_profile_id;
  update public.booking_participants minor set guardian_booking_participant_id=guardian.id
  from public.person_profiles source,public.booking_participants guardian
  where minor.booking_id=v_booking_id and source.id=minor.person_profile_id and source.guardian_person_id=guardian.person_profile_id and guardian.booking_id=v_booking_id;
  insert into public.booking_dogs(booking_id,dog_id,snapshot)
  select v_booking_id,d.id,jsonb_build_object('name',d.name,'breed',d.breed,'birth_date',d.birth_date,'sex',d.sex,'size',d.size,'sociability',d.sociability,'reactivity',d.reactivity,'medical_conditions',d.medical_conditions,'medications',d.medications,'notes',d.notes,'activity_level',d.activity_level,'hiking_experience',d.hiking_experience,'vaccination_current',d.vaccination_current,'vet_cleared',d.vet_cleared)
  from public.dogs d where d.id=any(p_dog_ids) and d.owner_profile_id=v_profile_id;
  select case when tc.mode='INCLUDED' then 0 else tc.price_cents end into v_transport_price from public.transport_configurations tc where tc.hike_id=v_hike.id;
  v_transport_price:=coalesce(v_transport_price,0);
  insert into public.transport_reservations(booking_id,booking_participant_id,price_cents,dog_ids)
  select v_booking_id,bp.id,v_transport_price,p_dog_ids from public.booking_participants bp where bp.booking_id=v_booking_id and bp.person_profile_id=any(p_transport_person_ids);
  if v_hike.pricing_mode='PERSON_DOG_BUNDLE' then v_hike_total:=cardinality(p_person_ids)*v_hike.price_cents+greatest(cardinality(p_dog_ids)-cardinality(p_person_ids),0)*v_hike.dog_price_cents;
  else v_hike_total:=cardinality(p_person_ids)*v_hike.price_cents+cardinality(p_dog_ids)*v_hike.dog_price_cents; end if;
  v_total:=v_hike_total+cardinality(p_transport_person_ids)*v_transport_price;
  update public.bookings set subtotal_cents=v_total,total_cents=v_total,updated_at=now() where id=v_booking_id;
  return v_booking_id;
end $$;
grant execute on function public.save_booking_draft(text,uuid,uuid[],uuid[],uuid[]) to authenticated;

create or replace function public.convert_waitlist_on_confirmation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='CONFIRMED' and old.status is distinct from 'CONFIRMED' then
    update public.waitlist_entries set status='CONVERTED'
    where hike_id=new.hike_id and profile_id=new.profile_id and status in ('WAITING','OFFERED');
  end if;
  return new;
end $$;
drop trigger if exists bookings_convert_waitlist on public.bookings;
create trigger bookings_convert_waitlist after update of status on public.bookings
for each row execute function public.convert_waitlist_on_confirmation();

insert into public.email_templates(key,subject,heading,body,button_label)
values
  ('HIKE_REMINDER_7D','Tu aventura es en una semana','La aventura se acerca','Revisa el punto de encuentro, prepara el equipo y completa cualquier paso pendiente.','ABRIR CENTRO DE AVENTURA'),
  ('HIKE_REMINDER_1D','Mañana caminamos en manada','Todo listo para mañana','Confirma horario, punto de encuentro y lleva agua, identificación y placa para tu perrito.','VER DETALLES DEL HIKE'),
  ('WAITLIST_OFFER','Se liberó un lugar para tu aventura','Tu lugar está disponible','Tienes una oportunidad para completar tu reservación antes de que venza la oferta.','RESERVAR MI LUGAR')
on conflict(key) do nothing;

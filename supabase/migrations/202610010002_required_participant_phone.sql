-- Require a valid Mexican contact number whenever a person is added to a booking.
-- Existing person profiles remain editable so members can complete missing data.

create or replace function public.require_booking_participant_phone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.snapshot->>'phone', '') !~ '^\+52[0-9]{10}$' then
    raise exception 'Participant phone required';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_participants_require_phone
on public.booking_participants;

create trigger booking_participants_require_phone
before insert or update of snapshot on public.booking_participants
for each row execute function public.require_booking_participant_phone();

-- The first person is the account holder. Keep the account phone in sync so
-- admin client views and reports use the same contact number.
create or replace function public.sync_primary_person_name_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  primary_person_id uuid;
begin
  if new.first_name is not distinct from old.first_name
     and new.last_name is not distinct from old.last_name
     and new.phone is not distinct from old.phone then
    return new;
  end if;

  select person.id
    into primary_person_id
  from public.person_profiles person
  where person.owner_profile_id = new.owner_profile_id
    and person.deleted_at is null
  order by person.created_at, person.id
  limit 1;

  if primary_person_id = new.id then
    update public.profiles
    set first_name = new.first_name,
        last_name = new.last_name,
        phone = new.phone
    where id = new.owner_profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists person_profiles_sync_primary_name
on public.person_profiles;

create trigger person_profiles_sync_primary_name
after update of first_name, last_name, phone on public.person_profiles
for each row execute function public.sync_primary_person_name_to_profile();

with primary_people as (
  select distinct on (person.owner_profile_id)
    person.owner_profile_id,
    person.phone
  from public.person_profiles person
  where person.deleted_at is null
    and person.phone ~ '^\+52[0-9]{10}$'
  order by person.owner_profile_id, person.created_at, person.id
)
update public.profiles profile
set phone = primary_person.phone
from primary_people primary_person
where profile.id = primary_person.owner_profile_id
  and profile.phone is distinct from primary_person.phone;

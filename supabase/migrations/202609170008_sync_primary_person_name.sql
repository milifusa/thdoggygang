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
     and new.last_name is not distinct from old.last_name then
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
        last_name = new.last_name
    where id = new.owner_profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists person_profiles_sync_primary_name on public.person_profiles;
create trigger person_profiles_sync_primary_name
after update of first_name, last_name on public.person_profiles
for each row
execute function public.sync_primary_person_name_to_profile();

-- Repair accounts whose titular was already edited before this trigger existed.
with primary_people as (
  select distinct on (person.owner_profile_id)
    person.owner_profile_id,
    person.first_name,
    person.last_name
  from public.person_profiles person
  where person.deleted_at is null
  order by person.owner_profile_id, person.created_at, person.id
)
update public.profiles profile
set first_name = primary_person.first_name,
    last_name = primary_person.last_name
from primary_people primary_person
where profile.id = primary_person.owner_profile_id
  and (
    profile.first_name is distinct from primary_person.first_name
    or profile.last_name is distinct from primary_person.last_name
  );

-- Keep role changes restricted while allowing trusted backend administration.
create or replace function public.protect_profile_role() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
    and coalesce(auth.role(), '') <> 'service_role'
    and public.current_role() <> 'ADMIN'
  then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end $$;

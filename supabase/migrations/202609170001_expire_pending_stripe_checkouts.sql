-- Offering a waitlist place also applies when an abandoned card checkout
-- returns a booking to DRAFT and releases its temporary capacity hold.
create or replace function public.offer_next_waitlist_member() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_entry public.waitlist_entries%rowtype;
declare v_slug text;
declare v_name text;
declare v_spots integer;
begin
  if (
    new.status='CANCELLED' and old.status in ('PENDING_PAYMENT','CONFIRMED')
  ) or (
    new.status='DRAFT' and old.status='PENDING_PAYMENT'
  ) then
    select a.spots_left into v_spots
    from public.public_hike_availability(array[new.hike_id]) a limit 1;
    select * into v_entry from public.waitlist_entries
    where hike_id=new.hike_id
      and status='WAITING'
      and people_count<=coalesce(v_spots,0)
    order by created_at for update skip locked limit 1;
    if found then
      update public.waitlist_entries
      set status='OFFERED',offer_expires_at=now()+interval '24 hours'
      where id=v_entry.id;
      select slug,name into v_slug,v_name from public.hikes where id=new.hike_id;
      insert into public.notifications(profile_id,channel,template_key,payload,status,sent_at)
      values(
        v_entry.profile_id,
        'IN_APP',
        'WAITLIST_OFFER',
        jsonb_build_object(
          'hike',v_name,
          'url','/reservar/'||v_slug,
          'expiresAt',now()+interval '24 hours'
        ),
        'SENT',
        now()
      );
    end if;
  end if;
  return new;
end $$;

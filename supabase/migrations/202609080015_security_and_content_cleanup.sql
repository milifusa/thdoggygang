-- Restrict staff-only hike visibility and remove the published smoke-test hike.

drop policy if exists hikes_public_read on public.hikes;
create policy hikes_public_read on public.hikes for select using (
  published
  or public.current_role() = 'ADMIN'
  or (
    public.current_role() = 'GUIDE'
    and exists (
      select 1
      from public.guide_hikes gh
      where gh.hike_id = hikes.id
        and gh.profile_id = public.current_profile_id()
    )
  )
);

update public.hikes
set published = false,
    updated_at = now()
where slug = 'asdasd'
  and lower(name) = 'preub';

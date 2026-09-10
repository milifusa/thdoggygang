-- Multiple, clickable meeting points for every hike.
create table if not exists public.hike_meeting_points (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null references public.hikes(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 120),
  address text not null default '' check (char_length(address) <= 240),
  maps_url text not null check (
    char_length(maps_url) <= 1200
    and maps_url ~* '^https://'
  ),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hike_meeting_points_hike_order_idx
  on public.hike_meeting_points(hike_id, sort_order, created_at);

drop trigger if exists hike_meeting_points_updated on public.hike_meeting_points;
create trigger hike_meeting_points_updated
before update on public.hike_meeting_points
for each row execute function public.set_updated_at();

alter table public.hike_meeting_points enable row level security;

drop policy if exists hike_meeting_points_member_read on public.hike_meeting_points;
create policy hike_meeting_points_member_read
on public.hike_meeting_points for select to authenticated
using (
  public.can_operate_hike(hike_meeting_points.hike_id)
  or exists (
    select 1
    from public.bookings b
    where b.hike_id = hike_meeting_points.hike_id
      and b.profile_id = public.current_profile_id()
      and b.status in ('DRAFT', 'PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED')
  )
);

drop policy if exists hike_meeting_points_admin_manage on public.hike_meeting_points;
create policy hike_meeting_points_admin_manage
on public.hike_meeting_points for all to authenticated
using (public.current_role() = 'ADMIN')
with check (public.current_role() = 'ADMIN');

revoke all on table public.hike_meeting_points from anon;
grant select, insert, update, delete on table public.hike_meeting_points to authenticated;

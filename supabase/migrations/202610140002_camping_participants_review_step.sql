-- Keep the exact campers on a booking and support the review step in the wizard.
alter table public.booking_camping_selections
  add column if not exists person_profile_ids uuid[] not null default '{}';

update public.booking_camping_selections selection
set person_profile_ids = coalesce((
  select array_agg(participant.person_profile_id order by participant.created_at)
  from public.booking_participants participant
  where participant.booking_id = selection.booking_id
    and participant.person_profile_id is not null
), '{}');

alter table public.bookings drop constraint if exists bookings_current_step_check;
alter table public.bookings add constraint bookings_current_step_check
  check (current_step in (
    'manada','personas','perritos','transporte','camping','productos',
    'revision','responsiva','pago','confirmacion'
  ));

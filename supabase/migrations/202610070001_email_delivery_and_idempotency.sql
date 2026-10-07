-- Auditable email delivery events and reusable protection against duplicate
-- mutations caused by double clicks, retries or network timeouts.

begin;

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  recipient text not null,
  subject text not null,
  status text not null default 'QUEUED' check (
    status in (
      'QUEUED','SENT','DELAYED','DELIVERED','OPENED','CLICKED',
      'BOUNCED','COMPLAINED','FAILED','SUPPRESSED'
    )
  ),
  provider text not null default 'resend',
  provider_id text,
  idempotency_key text not null unique,
  booking_id uuid references public.bookings(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  sent_by uuid references public.profiles(id) on delete set null,
  source text not null default 'SYSTEM',
  parent_delivery_id uuid references public.email_deliveries(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  failed_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_deliveries_provider_id_unique
  on public.email_deliveries(provider,provider_id)
  where provider_id is not null;
create index if not exists email_deliveries_created_idx
  on public.email_deliveries(created_at desc);
create index if not exists email_deliveries_recipient_idx
  on public.email_deliveries(lower(recipient),created_at desc);
create index if not exists email_deliveries_booking_idx
  on public.email_deliveries(booking_id,created_at desc)
  where booking_id is not null;

create table if not exists public.email_delivery_events (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  delivery_id uuid references public.email_deliveries(id) on delete set null,
  provider_id text,
  event_type text not null,
  recipient text,
  payload jsonb not null,
  event_created_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists email_delivery_events_delivery_idx
  on public.email_delivery_events(delivery_id,received_at desc);

create table if not exists public.idempotent_operations (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'IN_PROGRESS' check (
    status in ('IN_PROGRESS','SUCCEEDED','FAILED')
  ),
  response_status integer,
  response_body jsonb,
  error_message text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(operation,idempotency_key)
);

create index if not exists idempotent_operations_expiry_idx
  on public.idempotent_operations(expires_at);

create or replace function public.claim_idempotent_operation(
  p_operation text,
  p_idempotency_key text,
  p_request_hash text,
  p_actor_profile_id uuid default null
) returns table(
  operation_id uuid,
  claim_state text,
  stored_response_status integer,
  stored_response_body jsonb
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.idempotent_operations%rowtype;
begin
  insert into public.idempotent_operations(
    operation,idempotency_key,request_hash,actor_profile_id
  ) values (
    left(p_operation,120),left(p_idempotency_key,240),p_request_hash,p_actor_profile_id
  )
  on conflict(operation,idempotency_key) do nothing
  returning * into v_row;

  if found then
    return query select v_row.id,'CLAIMED'::text,null::integer,null::jsonb;
    return;
  end if;

  select * into v_row
  from public.idempotent_operations
  where operation=left(p_operation,120)
    and idempotency_key=left(p_idempotency_key,240)
  for update;

  if v_row.expires_at<=now() then
    update public.idempotent_operations
    set request_hash=p_request_hash,actor_profile_id=p_actor_profile_id,
        status='IN_PROGRESS',response_status=null,response_body=null,
        error_message=null,updated_at=now(),expires_at=now()+interval '24 hours'
    where id=v_row.id;
    return query select v_row.id,'CLAIMED'::text,null::integer,null::jsonb;
  elsif v_row.request_hash<>p_request_hash then
    return query select v_row.id,'MISMATCH'::text,null::integer,null::jsonb;
  elsif v_row.status='SUCCEEDED' then
    return query select v_row.id,'REPLAY'::text,v_row.response_status,v_row.response_body;
  elsif v_row.status='IN_PROGRESS' and v_row.updated_at>now()-interval '5 minutes' then
    return query select v_row.id,'IN_PROGRESS'::text,null::integer,null::jsonb;
  else
    update public.idempotent_operations
    set status='IN_PROGRESS',error_message=null,updated_at=now(),expires_at=now()+interval '24 hours'
    where id=v_row.id;
    return query select v_row.id,'CLAIMED'::text,null::integer,null::jsonb;
  end if;
end
$$;

create or replace function public.complete_idempotent_operation(
  p_operation_id uuid,
  p_response_status integer,
  p_response_body jsonb
) returns void
language sql
security definer
set search_path=public
as $$
  update public.idempotent_operations
  set status='SUCCEEDED',response_status=p_response_status,
      response_body=coalesce(p_response_body,'{}'::jsonb),updated_at=now()
  where id=p_operation_id
$$;

create or replace function public.fail_idempotent_operation(
  p_operation_id uuid,
  p_response_status integer,
  p_response_body jsonb,
  p_error_message text default null
) returns void
language sql
security definer
set search_path=public
as $$
  update public.idempotent_operations
  set status='FAILED',response_status=p_response_status,
      response_body=coalesce(p_response_body,'{}'::jsonb),
      error_message=left(p_error_message,1000),updated_at=now()
  where id=p_operation_id
$$;

revoke all on function public.claim_idempotent_operation(text,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.complete_idempotent_operation(uuid,integer,jsonb)
  from public,anon,authenticated;
revoke all on function public.fail_idempotent_operation(uuid,integer,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.claim_idempotent_operation(text,text,text,uuid)
  to service_role;
grant execute on function public.complete_idempotent_operation(uuid,integer,jsonb)
  to service_role;
grant execute on function public.fail_idempotent_operation(uuid,integer,jsonb,text)
  to service_role;

alter table public.email_deliveries enable row level security;
alter table public.email_delivery_events enable row level security;
alter table public.idempotent_operations enable row level security;

create policy email_deliveries_admin_read on public.email_deliveries for select
  using (public.current_role()='ADMIN');
create policy email_delivery_events_admin_read on public.email_delivery_events for select
  using (public.current_role()='ADMIN');

revoke all on table public.email_deliveries from anon,authenticated;
revoke all on table public.email_delivery_events from anon,authenticated;
revoke all on table public.idempotent_operations from anon,authenticated;
grant select on table public.email_deliveries to authenticated;
grant select on table public.email_delivery_events to authenticated;

commit;

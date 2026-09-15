alter table public.email_templates
  add column if not exists eyebrow text not null default '',
  add column if not exists image_path text;

insert into public.email_templates (key, subject, eyebrow, heading, body, button_label, active)
values
  ('AUTH_ACCESS', 'Tu acceso a The Doggy Gang', 'TU MANADA TE ESPERA', 'Qué gusto verte de nuevo.', 'Usa este acceso seguro para entrar a tu cuenta, ver tus aventuras y organizar a tu manada.', 'ENTRAR A MI MANADA', true),
  ('TEAM_INVITE', 'Te invitaron al equipo de The Doggy Gang', 'BIENVENIDO AL EQUIPO', 'La manada te espera.', 'Activa tu acceso para entrar al panel y ayudar a operar las próximas aventuras.', 'ACEPTAR INVITACIÓN', true),
  ('WAITLIST_OFFER', 'Se liberó un lugar para {hike}', 'LISTA DE ESPERA', 'Se liberó un lugar.', 'Ya puedes reservar {hike}. La oportunidad vence en 24 horas y el cupo se confirma al completar el pago.', 'RESERVAR MI LUGAR', true),
  ('HIKE_CHANGED', 'Actualización importante de {hike}', 'ACTUALIZACIÓN DE RUTA', 'Revisa tu aventura.', 'Actualizamos {hike}: {cambios}.', 'ABRIR CENTRO DE AVENTURA', true)
on conflict (key) do nothing;

update public.email_templates set eyebrow = case key
  when 'BOOKING_REMINDER' then 'RESERVACIÓN PENDIENTE'
  when 'HIKE_REMINDER_7D' then 'FALTA UNA SEMANA'
  when 'HIKE_REMINDER_1D' then 'MAÑANA ES EL DÍA'
  when 'WAITLIST_OFFER' then 'LISTA DE ESPERA'
  else eyebrow
end where eyebrow = '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy email_assets_public_read on storage.objects for select
  using (bucket_id = 'email-assets');
create policy email_assets_admin_insert on storage.objects for insert
  with check (bucket_id = 'email-assets' and public.current_role() = 'ADMIN');
create policy email_assets_admin_update on storage.objects for update
  using (bucket_id = 'email-assets' and public.current_role() = 'ADMIN')
  with check (bucket_id = 'email-assets' and public.current_role() = 'ADMIN');
create policy email_assets_admin_delete on storage.objects for delete
  using (bucket_id = 'email-assets' and public.current_role() = 'ADMIN');

create table if not exists public.email_access_requests (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists email_access_requests_email_time_idx
  on public.email_access_requests(email_hash, created_at desc);
alter table public.email_access_requests enable row level security;

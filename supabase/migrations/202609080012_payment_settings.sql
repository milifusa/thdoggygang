-- Payment configuration is private and can only be accessed with the service role.
create table if not exists public.payment_settings (
  id smallint primary key default 1 check (id = 1),
  bank_enabled boolean not null default false,
  bank_name text,
  bank_account_name text,
  bank_clabe text check (bank_clabe is null or bank_clabe ~ '^\d{18}$'),
  bank_reference_prefix text not null default 'TDG',
  stripe_enabled boolean not null default false,
  stripe_publishable_key text,
  stripe_secret_ciphertext text,
  stripe_webhook_ciphertext text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.payment_settings (id) values (1) on conflict (id) do nothing;
alter table public.payment_settings enable row level security;
revoke all on table public.payment_settings from anon, authenticated;
grant all on table public.payment_settings to service_role;

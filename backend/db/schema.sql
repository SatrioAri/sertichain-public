-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address varchar(42) not null unique check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  full_name varchar(100) not null check (length(trim(full_name)) > 0),
  student_id varchar(20),
  email varchar(100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_nonces (
  nonce varchar(64) primary key,
  wallet_address varchar(42) not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists auth_nonces_wallet_address_idx on public.auth_nonces (wallet_address);

-- Logout (option B): jti of every token that was logged out before it expired.
create table if not exists public.revoked_tokens (
  jti varchar(64) primary key,
  expires_at timestamptz not null
);

create index if not exists revoked_tokens_expires_at_idx on public.revoked_tokens (expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- RLS on with no policies: the public anon key can do nothing, only the backend's service_role key can.
alter table public.users enable row level security;
alter table public.auth_nonces enable row level security;
alter table public.revoked_tokens enable row level security;

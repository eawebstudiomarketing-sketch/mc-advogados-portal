-- Servidor MCP do portal: autorização OAuth (clientes, códigos, tokens) e log de auditoria.
-- Tudo só acessível pela service_role (RLS ligado e sem policies).

create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_hash text not null unique,
  refresh_hash text not null unique,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  profile_id uuid,
  tool text not null,
  args jsonb,
  before_snapshot jsonb,
  ok boolean not null default true,
  error text
);

create index if not exists mcp_audit_log_created_idx on public.mcp_audit_log (created_at desc);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
alter table public.mcp_audit_log enable row level security;

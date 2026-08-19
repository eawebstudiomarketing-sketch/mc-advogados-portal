-- MC Advogados Portal — schema inicial (Fase 2)
-- Convenção: toda tabela com RLS habilitado explicitamente, nunca confiar só
-- na UI pra bloquear dado de outro cliente.

create extension if not exists "pgcrypto";

-- ════════════════════════════════════════════════════════════════
-- ENUMS
-- ════════════════════════════════════════════════════════════════

create type public.user_role as enum ('client', 'advogado', 'admin');
create type public.tipo_pessoa as enum ('PF', 'PJ');
create type public.process_area as enum ('trabalhista', 'consumidor', 'previdenciario', 'civel', 'empresarial');
create type public.activity_type as enum ('consultoria', 'processo', 'contrato', 'reuniao', 'pesquisa');
create type public.activity_status as enum ('aberta', 'em_andamento', 'concluida', 'cancelada');
create type public.contract_status as enum ('active', 'expired', 'cancelled');
create type public.financial_status as enum ('pending', 'paid', 'overdue', 'cancelled');
create type public.document_category as enum ('contrato', 'processo', 'financeiro', 'pessoal', 'outros');

-- ════════════════════════════════════════════════════════════════
-- TABELAS
-- ════════════════════════════════════════════════════════════════

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tipo_pessoa public.tipo_pessoa not null,
  documento text not null,                    -- CPF ou CNPJ, sem máscara
  email_contact text not null,
  plan_start_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_documento_key on public.clients (documento);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,  -- nulo p/ equipe interna
  role public.user_role not null,
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  -- cliente (client_id preenchido) nunca deve ter role diferente de 'client',
  -- e equipe interna (advogado/admin) nunca deve ter client_id preenchido.
  constraint profiles_role_client_consistency check (
    (role = 'client' and client_id is not null) or
    (role in ('advogado', 'admin') and client_id is null)
  )
);
create index profiles_client_id_idx on public.profiles (client_id);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  advogado_id uuid not null references public.profiles (id) on delete restrict,
  activity_type public.activity_type not null,
  date date not null,
  hours numeric(5,2) not null check (hours > 0),
  description text not null,
  billable boolean not null default true,
  created_at timestamptz not null default now()
);
create index time_entries_client_date_idx on public.time_entries (client_id, date);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  responsible_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  description text,
  type public.activity_type not null,
  status public.activity_status not null default 'aberta',
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activities_client_id_idx on public.activities (client_id);
create index activities_status_idx on public.activities (status);

-- Tabela extra em relação ao modelo original — escritório tem contencioso ativo
create table public.processes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  numero_processo text not null,
  vara_tribunal text,
  area public.process_area not null,
  fase text,
  status text not null default 'ativo',
  responsible_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index processes_client_id_idx on public.processes (client_id);
create unique index processes_numero_processo_key on public.processes (numero_processo);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  category public.document_category not null,
  title text not null,
  file_path text not null,             -- caminho no Supabase Storage, convenção: {client_id}/{arquivo}
  created_at timestamptz not null default now()
);
create index documents_client_id_idx on public.documents (client_id);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  description text,
  start_date date not null,
  end_date date,
  status public.contract_status not null default 'active',
  value numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contracts_client_id_idx on public.contracts (client_id);

create table public.financial_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  paid_at timestamptz,
  status public.financial_status not null default 'pending',
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index financial_records_client_id_idx on public.financial_records (client_id);
create index financial_records_status_due_idx on public.financial_records (status, due_date);

create table public.financial_notifications (
  id uuid primary key default gen_random_uuid(),
  financial_record_id uuid not null references public.financial_records (id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.profiles (id) on delete set null  -- nulo = lembrete automático
);
create index financial_notifications_record_idx on public.financial_notifications (financial_record_id);

create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  reference_month smallint not null check (reference_month between 1 and 12),
  reference_year smallint not null check (reference_year >= 2020),
  pdf_url text,
  sent_at timestamptz,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index monthly_reports_client_period_key
  on public.monthly_reports (client_id, reference_year, reference_month);

-- ════════════════════════════════════════════════════════════════
-- updated_at automático nas tabelas com estado mutável
-- ════════════════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger activities_set_updated_at before update on public.activities
  for each row execute function public.set_updated_at();
create trigger processes_set_updated_at before update on public.processes
  for each row execute function public.set_updated_at();
create trigger contracts_set_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();
create trigger financial_records_set_updated_at before update on public.financial_records
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- HELPERS de RLS — SECURITY DEFINER + search_path fixado (evita o
-- clássico problema de recursão de política ao consultar "profiles"
-- dentro da própria política de "profiles", e fecha a mesma brecha de
-- search_path hijack encontrada na auditoria do projeto AnalyticsJus).
-- ════════════════════════════════════════════════════════════════

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_user_client_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select client_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles where user_id = auth.uid()
$$;

-- Só service_role deveria chamar essas funções em contexto de escrita
-- administrativa; SELECT é seguro pra qualquer usuário autenticado (só
-- devolve dado do próprio usuário).
revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_client_id() from public;
revoke all on function public.current_profile_id() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_client_id() to authenticated;
grant execute on function public.current_profile_id() to authenticated;

-- ════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.time_entries enable row level security;
alter table public.activities enable row level security;
alter table public.processes enable row level security;
alter table public.documents enable row level security;
alter table public.contracts enable row level security;
alter table public.financial_records enable row level security;
alter table public.financial_notifications enable row level security;
alter table public.monthly_reports enable row level security;

-- ---------- clients ----------
create policy "clients_select" on public.clients for select
  using (
    public.current_user_role() in ('admin', 'advogado')
    or id = public.current_user_client_id()
  );
create policy "clients_admin_write" on public.clients for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------- profiles ----------
-- Leitura ampla pra admin/advogado (precisam ver nome de cliente e de colega
-- de equipe nas telas operacionais); cliente só enxerga a própria linha.
create policy "profiles_select" on public.profiles for select
  using (
    public.current_user_role() in ('admin', 'advogado')
    or user_id = auth.uid()
  );
create policy "profiles_self_update" on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = (select role from public.profiles where user_id = auth.uid()));
create policy "profiles_admin_write" on public.profiles for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------- tabelas operacionais (não-financeiras) ----------
-- Padrão repetido: admin ALL; advogado ALL (acesso operacional, inclusive
-- escrita — quem lança hora/abre atividade/atualiza processo no dia a dia é
-- a equipe); cliente só SELECT do próprio client_id.
do $$
declare
  t text;
begin
  foreach t in array array['time_entries', 'activities', 'processes', 'documents', 'contracts']
  loop
    execute format($p$
      create policy "%1$s_client_select" on public.%1$s for select
        using (client_id = public.current_user_client_id());
    $p$, t);
    execute format($p$
      create policy "%1$s_staff_all" on public.%1$s for all
        using (public.current_user_role() in ('admin', 'advogado'))
        with check (public.current_user_role() in ('admin', 'advogado'));
    $p$, t);
  end loop;
end $$;

-- ---------- financeiro — SEM acesso de advogado (regra explícita do prompt) ----------
create policy "financial_records_client_select" on public.financial_records for select
  using (client_id = public.current_user_client_id());
create policy "financial_records_admin_all" on public.financial_records for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "financial_notifications_client_select" on public.financial_notifications for select
  using (
    exists (
      select 1 from public.financial_records fr
      where fr.id = financial_record_id
        and fr.client_id = public.current_user_client_id()
    )
  );
create policy "financial_notifications_admin_all" on public.financial_notifications for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------- monthly_reports — cliente lê o próprio, advogado lê (não é
-- financeiro em si, é o relatório do trabalho prestado), admin tudo ----------
create policy "monthly_reports_select" on public.monthly_reports for select
  using (
    public.current_user_role() in ('admin', 'advogado')
    or client_id = public.current_user_client_id()
  );
create policy "monthly_reports_admin_all" on public.monthly_reports for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Onboarding de clientes — réplica, dentro do portal, da skill de onboarding
-- (HTML autocontido com timbrado + 7 etapas de perguntas/ações) usada hoje
-- fora do sistema. Respostas ficam salvas no cliente e o PDF gerado vai pro
-- mesmo bucket "documents" já usado pelos outros módulos.
--
-- Admin-only (mesmo padrão de financial_records/monthly_reports pra dado
-- interno do escritório): cliente não vê, e não há mais um segundo tier de
-- staff "advogado" em uso — ver decisão registrada na Fase de correção de
-- papéis (2026-08-25).

create table public.onboardings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  answers jsonb not null default '{}'::jsonb,  -- chave = id da pergunta (ver src/lib/onboarding-schema.ts)
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index onboardings_client_id_idx on public.onboardings (client_id);

create trigger onboardings_set_updated_at before update on public.onboardings
  for each row execute function public.set_updated_at();

alter table public.onboardings enable row level security;

create policy "onboardings_admin_all" on public.onboardings for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

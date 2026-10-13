-- Demandas proativas geradas a partir de um onboarding (botão opcional na
-- tela do onboarding). A IA gera RASCUNHOS; nada vira atividade sem o admin
-- revisar e aprovar cada item. Ao aprovar, cria-se uma linha em
-- public.activities e o rascunho guarda o vínculo (activity_id).
-- Formato inspirado na seção "Próximos passos sugeridos" da Ata de Onboarding
-- (prioridade, ação sugerida, motivo, próximo passo).
--
-- Admin-only, mesmo padrão de public.onboardings.

create type public.demand_draft_status as enum ('rascunho', 'aprovada', 'descartada');
create type public.demand_priority as enum ('alta', 'media', 'baixa');

create table public.onboarding_demand_drafts (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.onboardings (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  position smallint not null default 0,
  title text not null,
  priority public.demand_priority not null default 'media',
  activity_type public.activity_type not null default 'consultoria',
  action text not null default '',
  reason text not null default '',
  next_step text not null default '',
  deadline date,
  status public.demand_draft_status not null default 'rascunho',
  activity_id uuid references public.activities (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index onboarding_demand_drafts_onboarding_id_idx
  on public.onboarding_demand_drafts (onboarding_id);

create trigger onboarding_demand_drafts_set_updated_at before update on public.onboarding_demand_drafts
  for each row execute function public.set_updated_at();

alter table public.onboarding_demand_drafts enable row level security;

create policy "onboarding_demand_drafts_admin_all" on public.onboarding_demand_drafts for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

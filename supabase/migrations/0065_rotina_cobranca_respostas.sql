-- 0065 (03/11/2026): pedidos do João/Maurício para Rotinas, Atividades e WhatsApp.
--  1. Tarefas fixas da rotina: ordem de prioridade (setas ↑↓), checklist (subitens que o
--     admin máximo monta e a pessoa marca no dia) e repetição mensal (além dos dias da semana).
--  2. Cobrança de documento: atividade que depende de documento do cliente cobra no Zap
--     de tempos em tempos até chegar (configuração do escritório editável no portal).
--  3. Mensagens rápidas do WhatsApp ("/atalho" na conversa), do escritório todo.

-- ───────────── 1. rotina ─────────────
alter table public.rotina_itens add column if not exists checklist jsonb not null default '[]'::jsonb;  -- [{id, texto}]
alter table public.rotina_itens add column if not exists repeticao text not null default 'semanal'
  check (repeticao in ('semanal', 'mensal'));
-- mensal: {"tipo":"dia","dia":5} | {"tipo":"util","qual":"primeiro"|"ultimo"} | {"tipo":"semana","ordem":1..4|-1,"dia_semana":0..6}
alter table public.rotina_itens add column if not exists regra_mensal jsonb;

-- a ordem passa a ser a prioridade: começa igual ao que aparecia (por horário)
with o as (
  select id, row_number() over (partition by responsavel_id order by hora_inicio nulls last, ordem, created_at) - 1 as n
  from public.rotina_itens
)
update public.rotina_itens r set ordem = o.n from o where o.id = r.id;

-- subitens marcados por dia (o item da rotina continua em rotina_feitos)
create table if not exists public.rotina_subitens_feitos (
  item_id uuid not null references public.rotina_itens (id) on delete cascade,
  sub_id text not null,
  responsavel_id uuid not null references public.responsaveis (id) on delete cascade,
  dia date not null,
  feito_em timestamptz not null default now(),
  primary key (item_id, sub_id, dia)
);
alter table public.rotina_subitens_feitos enable row level security;
drop policy if exists "rotina_subitens_select" on public.rotina_subitens_feitos;
create policy "rotina_subitens_select" on public.rotina_subitens_feitos for select
  using (public.current_user_role() in ('admin', 'advogado'));
drop policy if exists "rotina_subitens_write" on public.rotina_subitens_feitos;
create policy "rotina_subitens_write" on public.rotina_subitens_feitos for all
  using (responsavel_id = public.meu_responsavel_id() or public.current_user_super())
  with check (responsavel_id = public.meu_responsavel_id() or public.current_user_super());

-- ───────────── 2. cobrança de documento ─────────────
alter table public.escritorio_config add column if not exists cobranca_intervalo_dias int not null default 2
  check (cobranca_intervalo_dias between 1 and 30);
alter table public.escritorio_config add column if not exists cobranca_hora_inicio int not null default 9
  check (cobranca_hora_inicio between 6 and 20);
alter table public.escritorio_config add column if not exists cobranca_hora_fim int not null default 17
  check (cobranca_hora_fim between 7 and 22);
alter table public.escritorio_config add column if not exists cobranca_avisar_apos int not null default 5
  check (cobranca_avisar_apos between 1 and 50);
alter table public.escritorio_config add column if not exists cobranca_mensagem text not null
  default 'Olá, {cliente}! Tudo bem? Aqui é da MC Advogados. Para darmos andamento em "{titulo}", ainda precisamos de: {documentos}. Pode nos enviar por aqui mesmo, por favor? Obrigado!';

create table if not exists public.cobrancas_documentos (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references public.activities (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  documentos text[] not null default '{}',
  mensagem text not null,
  destino text not null default 'auto' check (destino in ('auto', 'grupo', 'numero')),
  intervalo_dias int not null default 2 check (intervalo_dias between 1 and 30),
  ativa boolean not null default true,
  proxima_em timestamptz not null default now(),
  ultima_em timestamptz,
  envios int not null default 0,
  equipe_avisada_em timestamptz,
  recebido_em timestamptz,
  recebido_por uuid references public.profiles (id) on delete set null,
  criado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cobrancas_documentos_proxima_idx on public.cobrancas_documentos (proxima_em) where ativa;
alter table public.cobrancas_documentos enable row level security;
drop policy if exists "cobrancas_documentos_equipe" on public.cobrancas_documentos;
create policy "cobrancas_documentos_equipe" on public.cobrancas_documentos for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

-- ───────────── 3. mensagens rápidas do WhatsApp ─────────────
create table if not exists public.wa_respostas_rapidas (
  id uuid primary key default gen_random_uuid(),
  atalho text not null unique check (atalho ~ '^[a-z0-9_-]{1,30}$'),
  texto text not null check (length(trim(texto)) > 0),
  ordem int not null default 0,
  criado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wa_respostas_rapidas enable row level security;
drop policy if exists "wa_respostas_rapidas_equipe" on public.wa_respostas_rapidas;
create policy "wa_respostas_rapidas_equipe" on public.wa_respostas_rapidas for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

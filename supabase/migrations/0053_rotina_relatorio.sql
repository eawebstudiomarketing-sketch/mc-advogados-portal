-- 0053 (30/10/2026): Rotinas v2 — relatório do dia com perguntas.
--  * rotina_modelos / rotina_perguntas: modelos de pergunta que o Maurício monta e reaproveita
--    (seções: pessoal = sobre si mesmo · equipe_geral = sobre a equipe toda · equipe_pessoa = repetida por pessoa);
--  * responsaveis.rotina_modelo_id: qual modelo cada pessoa usa (um card de rotina por pessoa);
--  * rotina_relatorios: o relatório de cada pessoa por dia (rascunho/enviado) com as respostas, as
--    justificativas das demandas vencidas e uma cópia das perguntas no momento do envio (editar o
--    modelo depois não mexe no histórico);
--  * rotina_relatorio_dia: controle do envio do fim do dia ao Maurício (não manda duas vezes).
-- Tudo só pelo servidor (service role); o admin máximo também lê direto.

create table if not exists public.rotina_modelos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rotina_perguntas (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.rotina_modelos (id) on delete cascade,
  secao text not null default 'pessoal' check (secao in ('pessoal', 'equipe_geral', 'equipe_pessoa')),
  ordem int not null default 0,
  texto text not null check (length(trim(texto)) > 0),
  tipo text not null default 'texto_longo' check (tipo in ('texto_curto', 'texto_longo', 'escolha', 'multipla', 'sim_nao', 'nota', 'numero')),
  opcoes text[] not null default '{}',
  obrigatoria boolean not null default true,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists rotina_perguntas_modelo_idx on public.rotina_perguntas (modelo_id, secao, ordem);

alter table public.responsaveis add column if not exists rotina_modelo_id uuid references public.rotina_modelos (id) on delete set null;

create table if not exists public.rotina_relatorios (
  id uuid primary key default gen_random_uuid(),
  responsavel_id uuid not null references public.responsaveis (id) on delete cascade,
  dia date not null,
  modelo_id uuid references public.rotina_modelos (id) on delete set null,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado')),
  respostas jsonb not null default '{}'::jsonb,
  justificativas jsonb not null default '{}'::jsonb,
  perguntas_snap jsonb,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (responsavel_id, dia)
);
create index if not exists rotina_relatorios_dia_idx on public.rotina_relatorios (dia);

create table if not exists public.rotina_relatorio_dia (
  dia date primary key,
  enviado_em timestamptz not null default now(),
  job_id uuid
);

alter table public.rotina_modelos enable row level security;
alter table public.rotina_perguntas enable row level security;
alter table public.rotina_relatorios enable row level security;
alter table public.rotina_relatorio_dia enable row level security;

drop policy if exists "rotina_modelos_super_select" on public.rotina_modelos;
create policy "rotina_modelos_super_select" on public.rotina_modelos for select using (public.current_user_super());
drop policy if exists "rotina_perguntas_super_select" on public.rotina_perguntas;
create policy "rotina_perguntas_super_select" on public.rotina_perguntas for select using (public.current_user_super());
drop policy if exists "rotina_relatorios_super_select" on public.rotina_relatorios;
create policy "rotina_relatorios_super_select" on public.rotina_relatorios for select using (public.current_user_super());

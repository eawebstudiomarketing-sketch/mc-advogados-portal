-- Andamentos dos processos (21/10/2026). Objetivo do escritório: sair do
-- Astrea. Fase 1: copiar do Astrea todos os processos (com a capa) e o
-- histórico, e ler os andamentos novos de hora em hora enquanto o Astrea
-- ainda estiver ativo. Aditiva: nada existente é apagado.

-- 1) Processo pode existir sem cliente cadastrado no portal (cliente do
--    Astrea que não está na base). Nesse caso só vê quem tem "todos os clientes".
alter table public.processes alter column client_id drop not null;

alter table public.processes
  add column if not exists astrea_id text unique,
  add column if not exists titulo text,             -- "Autor x Réu"
  add column if not exists cliente_nome text,       -- cliente como está no Astrea
  add column if not exists classe text,             -- classe / assunto
  add column if not exists partes jsonb not null default '[]'::jsonb, -- [{nome, papel, polo: 'ativo'|'passivo'|'outro'}]
  add column if not exists valor_causa numeric,
  add column if not exists distribuido_em date,
  add column if not exists instancia int,
  add column if not exists responsavel_nome text,   -- responsável no Astrea
  add column if not exists ultimo_andamento_em timestamptz,
  add column if not exists fonte text not null default 'manual';

-- quem pode ver um processo (com cliente: regra do cliente; sem cliente: "todos os clientes")
create or replace function public.pode_ver_processo(pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.processes p
    where p.id = pid
      and (
        public.pode_ver_cliente(p.client_id)
        or (p.client_id is null
            and public.current_user_role() in ('admin', 'advogado')
            and public.tem_permissao('todos_clientes'))
      )
  )
$$;

drop policy if exists "processes_sem_cliente_select" on public.processes;
create policy "processes_sem_cliente_select" on public.processes for select
  using (client_id is null and public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('todos_clientes'));
drop policy if exists "processes_sem_cliente_update" on public.processes;
create policy "processes_sem_cliente_update" on public.processes for update
  using (client_id is null and public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('todos_clientes'));

-- 2) Andamentos (movimentações, publicações e registros do histórico)
create table if not exists public.andamentos (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes (id) on delete cascade,
  data timestamptz not null,
  descricao text not null,
  tipo text not null default 'andamento',  -- andamento | publicacao | tarefa | nota
  importante boolean not null default false,
  fonte text not null default 'astrea',    -- astrea | datajud | manual
  externo_id text unique,                  -- ex.: astrea:4863731841662976
  situacao text not null default 'historico' check (situacao in ('novo', 'tratado', 'descartado', 'historico')),
  tratado_por uuid references public.profiles (id) on delete set null,
  tratado_em timestamptz,
  activity_id uuid references public.activities (id) on delete set null,
  descricao_html text,                     -- texto original do Astrea (publicação vem em HTML)
  responsavel_nome text,                   -- "Responsável" do registro no Astrea
  etiquetas jsonb not null default '[]'::jsonb, -- [{label, color}] como no Astrea
  bruto jsonb,                             -- registro completo, como veio do Astrea
  created_at timestamptz not null default now()
);
create index if not exists andamentos_processo_idx on public.andamentos (process_id, data desc);
create index if not exists andamentos_novos_idx on public.andamentos (situacao, data desc) where situacao = 'novo';

alter table public.andamentos enable row level security;
drop policy if exists "andamentos_select" on public.andamentos;
create policy "andamentos_select" on public.andamentos for select using (public.pode_ver_processo(process_id));
drop policy if exists "andamentos_update" on public.andamentos;
create policy "andamentos_update" on public.andamentos for update using (public.pode_ver_processo(process_id));
drop policy if exists "andamentos_insert" on public.andamentos;
create policy "andamentos_insert" on public.andamentos for insert with check (public.pode_ver_processo(process_id));

-- 3) Registro de cada leitura (para a tela mostrar quando foi a última)
create table if not exists public.andamentos_sync (
  id uuid primary key default gen_random_uuid(),
  iniciado_em timestamptz not null default now(),
  origem text not null default 'cron',
  processos int not null default 0,
  novos int not null default 0,
  erro text
);
alter table public.andamentos_sync enable row level security;
drop policy if exists "andamentos_sync_select" on public.andamentos_sync;
create policy "andamentos_sync_select" on public.andamentos_sync for select using (public.current_user_role() = 'admin');

-- 4) Publicações também vêm do Astrea (tela Publicações dele), no mesmo
--    formato: diário, órgão, nome pesquisado, responsável, texto original.
--    Quando a mesma intimação já veio pelo DJEN, a linha é completada (sem duplicar).
alter table public.publicacoes alter column comunicacao_id drop not null;
alter table public.publicacoes
  add column if not exists fonte text not null default 'djen',   -- djen | inpi | astrea
  add column if not exists astrea_id text unique,
  add column if not exists diario text,             -- ex.: TRF1DJN, TJBADJN
  add column if not exists nome_pesquisado text,    -- termo que trouxe a publicação no Astrea
  add column if not exists responsavel_nome text,   -- responsável pelo processo no Astrea
  add column if not exists titulo_processo text,    -- "Autor x Réu" como no Astrea
  add column if not exists data_publicacao date,    -- "Publicado em"
  add column if not exists texto_html text,         -- texto original (com o nome destacado)
  add column if not exists bruto jsonb;

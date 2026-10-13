-- Monitor de publicações (out/2026): busca diária no DJEN (Comunica PJe/CNJ)
-- pelas OABs cadastradas, guarda cada intimação, liga ao processo/cliente pelo
-- número e avisa por e-mail. Aditiva.

-- 1) Processos: número só com dígitos, para casar com o DJEN (que manda sem máscara).
alter table public.processes
  add column if not exists numero_digitos text
  generated always as (regexp_replace(numero_processo, '\D', '', 'g')) stored;
create index if not exists processes_numero_digitos_idx on public.processes (numero_digitos);

-- 2) O que monitorar (OABs) e para onde mandar o aviso.
create table if not exists public.monitor_oabs (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  uf text not null,
  nome text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (numero, uf)
);

create table if not exists public.monitor_config (
  id int primary key default 1 check (id = 1),
  email_alerta text,
  updated_at timestamptz not null default now()
);

-- 3) Publicações recebidas. comunicacao_id = id da comunicação no DJEN (evita duplicar).
create table if not exists public.publicacoes (
  id uuid primary key default gen_random_uuid(),
  comunicacao_id bigint not null unique,
  numero_processo text not null,          -- só dígitos
  numero_mascara text,
  tribunal text,
  orgao text,
  tipo_comunicacao text,
  tipo_documento text,
  classe text,
  meio text,
  data_disponibilizacao date not null,
  texto text,
  link text,
  partes jsonb not null default '[]',
  advogados jsonb not null default '[]',
  termo text,                             -- OAB que trouxe a publicação (ex.: 76770/BA)
  process_id uuid references public.processes (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  status text not null default 'nao_tratada' check (status in ('nao_tratada', 'tratada', 'descartada')),
  tratada_por uuid references public.profiles (id) on delete set null,
  tratada_em timestamptz,
  activity_id uuid references public.activities (id) on delete set null,
  avisada_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists publicacoes_status_idx on public.publicacoes (status);
create index if not exists publicacoes_data_idx on public.publicacoes (data_disponibilizacao desc);
create index if not exists publicacoes_numero_idx on public.publicacoes (numero_processo);
create index if not exists publicacoes_process_idx on public.publicacoes (process_id);

-- 4) Histórico das buscas (para conferir se o robô rodou).
create table if not exists public.monitor_execucoes (
  id uuid primary key default gen_random_uuid(),
  iniciado_em timestamptz not null default now(),
  origem text not null default 'cron',
  encontradas int not null default 0,
  novas int not null default 0,
  erro text
);

-- 5) Acesso. Configuração e histórico: só admin. Publicações: equipe com a
--    permissão "publicacoes"; advogado vê as dos clientes dele e as que ainda
--    não estão ligadas a cliente nenhum (para alguém poder tratar).
alter table public.monitor_oabs enable row level security;
alter table public.monitor_config enable row level security;
alter table public.monitor_execucoes enable row level security;
alter table public.publicacoes enable row level security;

create policy "monitor_oabs_admin_all" on public.monitor_oabs for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "monitor_config_admin_all" on public.monitor_config for all
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "monitor_execucoes_admin_select" on public.monitor_execucoes for select
  using (public.current_user_role() = 'admin');

create policy "publicacoes_equipe_select" on public.publicacoes for select
  using (public.tem_permissao('publicacoes') and (client_id is null or public.pode_ver_cliente(client_id)));
create policy "publicacoes_equipe_update" on public.publicacoes for update
  using (public.tem_permissao('publicacoes') and (client_id is null or public.pode_ver_cliente(client_id)))
  with check (public.tem_permissao('publicacoes') and (client_id is null or public.pode_ver_cliente(client_id)));

-- 6) Ponto de partida: OAB do Dr. Maurício e e-mail de aviso.
insert into public.monitor_oabs (numero, uf, nome) values ('76770', 'BA', 'Maurício Oliveira Cardoso Filho')
on conflict (numero, uf) do nothing;
insert into public.monitor_config (id, email_alerta) values (1, 'mauriciocardosof.adv@gmail.com')
on conflict (id) do nothing;

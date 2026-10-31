-- 0061 (30/10/2026): módulo Marcas (INPI) no portal, no mesmo jeito do Marca Acompanhada
-- (Principal, Processos, Cadastrar processos, Revistas INPI, Colidências). Toda terça o
-- portal lê a Revista da Propriedade Industrial (RPI) e atualiza a carteira na hora.
--
--  * marcas: carteira acompanhada (marca, patente, desenho, programa), com o último despacho;
--  * marca_publicacoes: histórico de cada processo nas revistas (RPI, data, código, despacho);
--  * marca_prazos: prazos administrativos que nascem dos despachos (recurso, oposição, decênio…);
--  * rpi_revistas: revistas já lidas pelo portal (para não ler duas vezes);
--  * marca_colidencias: marcas parecidas publicadas na revista que podem conflitar com as nossas.
-- Escrita pelo servidor (service role, depois de conferir a permissão "marcas");
-- a equipe com a permissão lê.

create table if not exists public.marcas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'marca' check (tipo in ('marca', 'patente', 'desenho', 'programa')),
  processo text not null unique,
  nome text,
  apresentacao text,            -- Nominativa, Mista, Figurativa, Tridimensional
  natureza text,                -- Produto, Serviço, Coletiva, Certificação
  classe text,                  -- ex.: NCL(12) 43
  status_classe text,
  especificacao text,
  cfe text,                     -- classificação de elementos figurativos
  titular text,
  titular_uf text,
  procurador text,
  deposito date,
  concessao date,
  vigencia date,
  situacao text,
  ultimo_despacho text,
  ultimo_despacho_codigo text,
  ultimo_despacho_data date,
  ultima_rpi int,
  previsao text,                -- próximas etapas estimadas (texto pronto)
  imagem text,                  -- caminho no Storage (bucket marcas) ou data URL pequena
  client_id uuid references public.clients (id) on delete set null,
  acompanhando boolean not null default true,
  avisar_cliente boolean not null default true,
  colidencia boolean not null default true,
  apelido text,                 -- nome para marca só figurativa (sem nome no INPI)
  -- configuração da colidência (tela Configurar acompanhamento)
  colid_auto boolean not null default true,
  colid_escopo smallint not null default 1 check (colid_escopo in (1, 2, 3)),          -- 1 mesma classe · 2 mesma natureza · 3 todas
  colid_sensibilidade smallint not null default 2 check (colid_sensibilidade in (1, 2, 3)), -- 1 alta >70% · 2 média >85% · 3 baixa >95%
  colid_termos jsonb not null default '{}'::jsonb,   -- {"BURGER": 3, "101": 1} (3 alta · 2 média · 1 ignorar)
  colid_extras text[] not null default '{}',
  colid_ignorar text[] not null default '{}',
  observacao text,
  -- aba WhatsApp (disparo por status): contato do cliente e o status usado na mensagem,
  -- que a advogada pode trocar à mão (a mensagem muda junto)
  contato_nome text,
  contato_numero text,
  status_mensagem text,
  sincronizado_em timestamptz,  -- última leitura da ficha no INPI (pePI)
  origem text not null default 'portal' check (origem in ('portal', 'marca_acompanhada', 'rpi')),
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marcas_cliente_idx on public.marcas (client_id);
create index if not exists marcas_situacao_idx on public.marcas (acompanhando, situacao);

create table if not exists public.marca_publicacoes (
  id bigint generated always as identity primary key,
  marca_id uuid not null references public.marcas (id) on delete cascade,
  rpi int not null,
  data date not null,
  codigo text not null default '',
  despacho text not null,
  info text,
  avisado_em timestamptz,       -- quando o cliente foi avisado deste despacho
  created_at timestamptz not null default now(),
  unique (marca_id, rpi, despacho)
);
create index if not exists marca_publicacoes_rpi_idx on public.marca_publicacoes (rpi desc);

create table if not exists public.marca_prazos (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  acao text not null,           -- ex.: Recorrer de decisão de indeferimento
  vence_em date not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'realizado', 'perdido', 'dispensado')),
  origem_rpi int,
  origem_codigo text,
  activity_id uuid references public.activities (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marca_id, acao, vence_em)
);
create index if not exists marca_prazos_vence_idx on public.marca_prazos (situacao, vence_em);

create table if not exists public.rpi_revistas (
  numero int primary key,
  data date not null,
  processada_em timestamptz,
  total_processos int,
  despachos_nossos int,
  colidencias int,
  pdf_url text,
  erro text
);

create table if not exists public.marca_colidencias (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  rpi int not null,
  processo text not null,       -- processo de terceiro, parecido com a nossa marca
  nome text,
  classe text,
  titular text,
  despacho text,
  semelhanca numeric,           -- 0 a 1
  risco text not null default 'medio' check (risco in ('alto', 'medio', 'baixo')),
  status text not null default 'pendente' check (status in ('pendente', 'revisada', 'acao', 'monitorando')),
  observacao text,
  revisado_por uuid,
  revisado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (marca_id, processo)
);
create index if not exists marca_colidencias_status_idx on public.marca_colidencias (status, rpi desc);

-- modelos de mensagem do WhatsApp, um por status (editáveis na aba WhatsApp)
-- variáveis: {cliente} {marca} {processo} {status} {data} {despacho} {classe} {proxima_etapa}
create table if not exists public.marca_modelos (
  id uuid primary key default gen_random_uuid(),
  status text not null unique,
  texto text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  updated_at timestamptz not null default now()
);

-- como sai o informativo das marcas: manual (botão "Enviar no Zap") ou automático
-- num dia do mês (1 a 28), às 09h; uma linha só
create table if not exists public.marca_config (
  id int primary key default 1 check (id = 1),
  envio_modo text not null default 'manual' check (envio_modo in ('manual', 'automatico')),
  envio_dia smallint not null default 5 check (envio_dia between 1 and 28),
  ultimo_envio_auto date,
  updated_at timestamptz not null default now()
);
insert into public.marca_config (id) values (1) on conflict (id) do nothing;

-- cada disparo feito pela aba WhatsApp (o que saiu, para quem e quando)
create table if not exists public.marca_envios (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  numero text not null,
  texto text not null,
  status text,
  job_id uuid,
  enviado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists marca_envios_marca_idx on public.marca_envios (marca_id, created_at desc);

drop trigger if exists marcas_updated_at on public.marcas;
create trigger marcas_updated_at before update on public.marcas for each row execute function public.set_updated_at();
drop trigger if exists marca_prazos_updated_at on public.marca_prazos;
create trigger marca_prazos_updated_at before update on public.marca_prazos for each row execute function public.set_updated_at();

alter table public.marcas enable row level security;
alter table public.marca_publicacoes enable row level security;
alter table public.marca_prazos enable row level security;
alter table public.rpi_revistas enable row level security;
alter table public.marca_colidencias enable row level security;
alter table public.marca_modelos enable row level security;
alter table public.marca_envios enable row level security;
alter table public.marca_config enable row level security;
drop policy if exists "marca_config_equipe" on public.marca_config;
create policy "marca_config_equipe" on public.marca_config for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));

drop policy if exists "marca_modelos_equipe" on public.marca_modelos;
create policy "marca_modelos_equipe" on public.marca_modelos for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));
drop policy if exists "marca_envios_equipe" on public.marca_envios;
create policy "marca_envios_equipe" on public.marca_envios for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));

drop policy if exists "marcas_equipe" on public.marcas;
create policy "marcas_equipe" on public.marcas for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));
drop policy if exists "marca_publicacoes_equipe" on public.marca_publicacoes;
create policy "marca_publicacoes_equipe" on public.marca_publicacoes for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));
drop policy if exists "marca_prazos_equipe" on public.marca_prazos;
create policy "marca_prazos_equipe" on public.marca_prazos for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));
drop policy if exists "rpi_revistas_equipe" on public.rpi_revistas;
create policy "rpi_revistas_equipe" on public.rpi_revistas for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));
drop policy if exists "marca_colidencias_equipe" on public.marca_colidencias;
create policy "marca_colidencias_equipe" on public.marca_colidencias for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));

-- auditoria (quem mexeu em quê), como as outras tabelas principais
do $$
begin
  if to_regprocedure('public.auditar()') is not null then
    execute 'drop trigger if exists auditar_marcas on public.marcas';
    execute 'create trigger auditar_marcas after insert or update or delete on public.marcas for each row execute function public.auditar()';
  end if;
end $$;

-- imagens das marcas (logo) no Storage, privado
insert into storage.buckets (id, name, public) values ('marcas', 'marcas', false) on conflict (id) do nothing;

-- modelos iniciais (a advogada edita na aba WhatsApp)
insert into public.marca_modelos (status, ordem, texto) values
  ('Padrão', 0, E'Olá, {cliente}! Segue a atualização da sua marca *{marca}* (processo {processo}) no INPI.\nSituação: {status}\nÚltimo despacho: {despacho} ({data_despacho}).\nQualquer dúvida, estamos à disposição.\nMC Advogados'),
  ('Registro de marca em vigor', 1, E'Olá, {cliente}! Sua marca *{marca}* (processo {processo}) está registrada e em vigor no INPI. A próxima renovação (decênio) vence em {data}.\nMC Advogados'),
  ('Aguardando exame de mérito', 2, E'Olá, {cliente}! Sua marca *{marca}* (processo {processo}) segue aguardando o exame de mérito do INPI. Previsão: {proxima_etapa}.\nSeguimos acompanhando toda semana.\nMC Advogados'),
  ('Aguardando prazo de apresentação de oposição', 3, E'Olá, {cliente}! O pedido da sua marca *{marca}* (processo {processo}) foi publicado na revista do INPI e está no prazo de oposição, que termina em {data}.\nMC Advogados'),
  ('Aguardando processamento da concessão do registro de marca', 4, E'Olá, {cliente}! Boa notícia: o pedido da sua marca *{marca}* (processo {processo}) foi deferido pelo INPI. Agora aguardamos a concessão do registro.\nMC Advogados'),
  ('Pedido de registro de marca indeferido', 5, E'Olá, {cliente}! O INPI indeferiu o pedido da sua marca *{marca}* (processo {processo}). O prazo para recurso vai até {data}. Vamos conversar sobre o próximo passo?\nMC Advogados'),
  ('Aguardando apresentação e exame de recurso contra o indeferimento', 6, E'Olá, {cliente}! O recurso da sua marca *{marca}* (processo {processo}) está em análise no INPI. Seguimos acompanhando.\nMC Advogados'),
  ('Aguardando manifestação sobre oposição', 7, E'Olá, {cliente}! Houve oposição ao pedido da sua marca *{marca}* (processo {processo}). O prazo para manifestação vai até {data}.\nMC Advogados')
on conflict (status) do nothing;

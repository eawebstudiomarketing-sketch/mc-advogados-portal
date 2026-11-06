-- CRM / Comercial (06/11/2026): formulários próprios (no lugar do Yay! Forms),
-- funil de leads, histórico de cada lead e pixels (Meta e Google). Aditiva.
-- Acesso: tudo pelo servidor (service role) depois de conferir a permissão
-- "comercial" (lib/permissoes.ts); as tabelas novas ficam com RLS ligado e sem
-- política (ninguém lê direto com o login). O envio do formulário público
-- também passa pelo servidor (rota /api/f/[slug]).

-- 1) ETAPAS do funil (editáveis). tipo: aberta | ganho | perdido
create table if not exists public.crm_etapas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 0,
  cor text not null default 'navy',
  tipo text not null default 'aberta' check (tipo in ('aberta', 'ganho', 'perdido')),
  created_at timestamptz not null default now()
);

insert into public.crm_etapas (nome, ordem, cor, tipo)
select * from (values
  ('Novo', 1, 'info', 'aberta'),
  ('Em contato', 2, 'navy', 'aberta'),
  ('Reunião marcada', 3, 'pending', 'aberta'),
  ('Proposta enviada', 4, 'gold', 'aberta'),
  ('Fechado', 5, 'success', 'ganho'),
  ('Perdido', 6, 'danger', 'perdido')
) as v(nome, ordem, cor, tipo)
where not exists (select 1 from public.crm_etapas);

-- 2) FORMULÁRIOS. `config` guarda tema, tela de boas-vindas, perguntas e tela final
--    (mesmo desenho do Yay: uma pergunta por tela, imagem no alto).
create table if not exists public.crm_formularios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  nome text not null,
  ativo boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  responsavel_padrao uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) CONFIGURAÇÃO (uma linha): pixels e distribuição dos leads.
create table if not exists public.crm_config (
  id int primary key default 1 check (id = 1),
  meta_pixel_id text,
  meta_capi_token text,          -- token da API de Conversões (só o servidor lê)
  meta_test_code text,           -- código de teste do Gerenciador de Eventos (opcional)
  ga4_id text,                   -- G-XXXXXXX
  ga4_api_secret text,           -- Measurement Protocol (conversão de lead fechado)
  ads_id text,                   -- AW-XXXXXXX
  ads_label text,                -- rótulo da conversão de lead
  rodizio uuid[] not null default '{}', -- quem recebe lead novo, em rodízio (vazio = responsável do formulário)
  rodizio_ultimo int not null default -1,
  avisar_zap boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.crm_config (id) values (1) on conflict (id) do nothing;

-- 4) LEADS: a tabela já existe (0020, captação pelo WhatsApp); ganha o funil.
alter table public.leads
  add column if not exists email text,
  add column if not exists empresa text,
  add column if not exists etapa_id uuid references public.crm_etapas (id) on delete set null,
  add column if not exists formulario_id uuid references public.crm_formularios (id) on delete set null,
  add column if not exists respostas jsonb not null default '[]'::jsonb, -- [{pergunta, resposta}]
  add column if not exists utm jsonb not null default '{}'::jsonb,       -- source, medium, campaign, content, term
  add column if not exists rastreio jsonb not null default '{}'::jsonb,  -- fbclid, gclid, fbp, fbc, ga, pagina, referrer, ua, ip, event_id
  add column if not exists valor numeric(12, 2),
  add column if not exists motivo_perda text,
  add column if not exists proximo_contato timestamptz,
  add column if not exists primeiro_contato_em timestamptz,
  add column if not exists ganho_em timestamptz,
  add column if not exists perdido_em timestamptz,
  add column if not exists tags text[] not null default '{}',
  add column if not exists observacoes text;

update public.leads set etapa_id = (select id from public.crm_etapas where tipo = 'aberta' order by ordem limit 1)
where etapa_id is null;

create index if not exists leads_etapa_idx on public.leads (etapa_id);
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_telefone_idx on public.leads (telefone);
create index if not exists leads_formulario_idx on public.leads (formulario_id);

-- 5) HISTÓRICO de cada lead (criado, mudou de etapa, nota, contato…)
create table if not exists public.crm_lead_eventos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  tipo text not null, -- criado | etapa | nota | contato | responsavel | cliente | pixel
  texto text,
  dados jsonb not null default '{}'::jsonb,
  autor uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_lead_eventos_lead_idx on public.crm_lead_eventos (lead_id, created_at desc);

-- 6) FUNIL do formulário: abriu, começou, enviou (uma linha por visita e passo).
create table if not exists public.crm_form_eventos (
  id bigint generated always as identity primary key,
  formulario_id uuid not null references public.crm_formularios (id) on delete cascade,
  sessao text not null,
  tipo text not null check (tipo in ('abriu', 'comecou', 'enviou')),
  created_at timestamptz not null default now(),
  unique (formulario_id, sessao, tipo)
);
create index if not exists crm_form_eventos_idx on public.crm_form_eventos (formulario_id, created_at desc);

alter table public.crm_etapas enable row level security;
alter table public.crm_formularios enable row level security;
alter table public.crm_config enable row level security;
alter table public.crm_lead_eventos enable row level security;
alter table public.crm_form_eventos enable row level security;

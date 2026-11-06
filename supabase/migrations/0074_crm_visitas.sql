-- Pixel próprio do CRM (06/11/2026): cada visita aos formulários públicos vira
-- uma linha, atualizada enquanto a pessoa avança. Guarda de onde veio, aparelho,
-- cidade aproximada e ATÉ ONDE FOI (pergunta e tempo em cada uma). Não guarda o
-- que foi digitado por quem não enviou (LGPD). Quem envia: a visita (e as visitas
-- anteriores do mesmo visitante) ficam ligadas ao lead (jornada na ficha).
-- Apagadas sozinhas depois de 90 dias. Aditiva.

create table if not exists public.crm_visitas (
  id text primary key,                       -- id da visita (aba do navegador)
  visitante text not null,                   -- id do aparelho (volta = mesma pessoa)
  formulario_id uuid not null references public.crm_formularios (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  inicio timestamptz not null default now(),
  ultimo_em timestamptz not null default now(),
  passo_max int not null default -1,         -- -1 = só viu a abertura; 0.. = índice da pergunta mais longe
  passo_atual int not null default -1,
  total_passos int not null default 0,
  enviou boolean not null default false,
  tempos jsonb not null default '{}'::jsonb, -- {campo_id: ms}
  canal text,                                -- Anúncio Meta | Anúncio Google | Instagram | Link direto…
  utm jsonb not null default '{}'::jsonb,
  referrer text,
  aparelho text,                             -- Celular | Computador | Tablet
  sistema text,                              -- iPhone | Android | Windows | Mac…
  navegador text,
  cidade text,
  uf text,
  pais text
);

create index if not exists crm_visitas_form_idx on public.crm_visitas (formulario_id, inicio desc);
create index if not exists crm_visitas_visitante_idx on public.crm_visitas (visitante);
create index if not exists crm_visitas_lead_idx on public.crm_visitas (lead_id) where lead_id is not null;
create index if not exists crm_visitas_ultimo_idx on public.crm_visitas (ultimo_em desc);

alter table public.crm_visitas enable row level security;

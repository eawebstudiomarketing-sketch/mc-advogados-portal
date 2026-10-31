-- Regimento Interno (31/10/2026): questionário gerado com IA por empresa (como o
-- Google Forms do escritório), link público sem login para a empresa responder
-- e as respostas na ficha do cliente.
create table if not exists public.regimentos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  titulo text not null,
  descricao text,                                  -- texto do topo ("Objetivo: …")
  segmento text,
  dados jsonb not null default '{}'::jsonb,        -- o que foi informado ao criar (nome, funcionários, atividade…)
  secoes jsonb not null default '[]'::jsonb,       -- [{id, titulo, descricao, perguntas:[{id, tipo, texto, ajuda, opcoes, outro, obrigatoria}]}]
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  aceitando boolean not null default true,         -- "Aceitando respostas" do Google Forms
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'respondido')),
  rascunho_respostas jsonb not null default '{}'::jsonb,  -- o que a empresa já preencheu (salvo enquanto responde)
  respostas jsonb,                                 -- respostas enviadas {perguntaId: texto | [opções]}
  respondido_em timestamptz,
  respondente text,                                -- nome de quem respondeu (opcional no formulário)
  origem text not null default 'portal' check (origem in ('portal', 'drive')),
  arquivo_origem text,                             -- link do documento importado do Drive
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists regimentos_cliente_idx on public.regimentos (client_id, created_at desc);

alter table public.regimentos enable row level security;
-- equipe com a tela Onboarding e acesso ao cliente lê; escrita só pelo servidor (service role)
drop policy if exists "regimentos_equipe" on public.regimentos;
create policy "regimentos_equipe" on public.regimentos for select
  using (
    public.current_user_role() in ('admin', 'advogado')
    and public.tem_permissao('onboarding')
    and (client_id is null or public.pode_ver_cliente(client_id))
  );

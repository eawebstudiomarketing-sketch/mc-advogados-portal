-- Marcas → Busca com IA (31/10/2026): histórico das pesquisas de viabilidade
-- (o Marca Acompanhada guarda e deixa reabrir / gerar PDF).
create table if not exists public.marca_buscas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  entrada jsonb not null default '{}'::jsonb,   -- nome, siglas, onde usar, contexto, texto do logo
  resultado jsonb not null default '{}'::jsonb, -- classes, anterioridades e parecer
  criado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists marca_buscas_data_idx on public.marca_buscas (created_at desc);
alter table public.marca_buscas enable row level security;
drop policy if exists "marca_buscas_equipe" on public.marca_buscas;
create policy "marca_buscas_equipe" on public.marca_buscas for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('marcas'));

-- Painel do Dono 2.0 (24/10/2026): relatório do "gerente" por período.
-- Cada período é escrito 1x pela IA e guardado; os que terminam "agora"
-- (hoje, 7 dias, este mês…) são refeitos no máximo a cada hora.
create table if not exists public.painel_gerente (
  chave text primary key,              -- "<periodo>|<data inicial>"
  conteudo jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.painel_gerente enable row level security;
drop policy if exists "painel_gerente_super" on public.painel_gerente;
create policy "painel_gerente_super" on public.painel_gerente for select using (public.current_user_super());

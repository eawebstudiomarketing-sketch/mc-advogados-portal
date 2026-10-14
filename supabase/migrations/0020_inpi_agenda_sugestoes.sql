-- Monitor: INPI (revista semanal de marcas), agenda (prazo/audiência com hora)
-- e registro das sugestões aceitas (para a % de acerto). Aditiva.

-- 1) INPI: nomes de procurador vigiados e última revista já lida.
alter table public.monitor_config
  add column if not exists inpi_procuradores text[] not null default array['MAURICIO OLIVEIRA CARDOSO FILHO'],
  add column if not exists inpi_ultima_revista int;

-- 2) Publicações: quais sugestões o sistema ofereceu e qual foi usada.
alter table public.publicacoes
  add column if not exists sugestoes_tipos text[] not null default '{}',
  add column if not exists sugestao_aceita text;

-- 3) Atividades viram itens de agenda: categoria (tarefa, prazo, audiência) e hora.
alter table public.activities
  add column if not exists categoria text not null default 'tarefa',
  add column if not exists hora time;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activities_categoria_check') then
    alter table public.activities add constraint activities_categoria_check check (categoria in ('tarefa', 'prazo', 'audiencia'));
  end if;
end $$;
create index if not exists activities_deadline_idx on public.activities (deadline);

-- 4) Aviso no celular (Web Push): aparelhos que cada pessoa ativou.
create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  created_at timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
create policy "push_inscricoes_proprias" on public.push_inscricoes for all
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

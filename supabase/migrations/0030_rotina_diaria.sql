-- 0030 (out/2026): rotina diária de cada pessoa (pedido de 20/10).
--  * rotina_itens: o que cada pessoa faz todo dia (só o admin máximo define),
--    com os dias da semana em que aparece (0 = domingo … 6 = sábado);
--  * rotina_feitos: o que a pessoa marcou como feito em cada dia.
--    Cada item feito vale 1 ponto no ranking, igual a uma demanda concluída.

create table if not exists public.rotina_itens (
  id uuid primary key default gen_random_uuid(),
  responsavel_id uuid not null references public.responsaveis (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  dias smallint[] not null default '{1,2,3,4,5}',
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists rotina_itens_resp_idx on public.rotina_itens (responsavel_id, ordem);

create table if not exists public.rotina_feitos (
  item_id uuid not null references public.rotina_itens (id) on delete cascade,
  responsavel_id uuid not null references public.responsaveis (id) on delete cascade,
  dia date not null,
  feito_em timestamptz not null default now(),
  primary key (item_id, dia)
);
create index if not exists rotina_feitos_dia_idx on public.rotina_feitos (dia, responsavel_id);

alter table public.rotina_itens enable row level security;
alter table public.rotina_feitos enable row level security;

-- a equipe vê (ranking e o "Meu dia" de quem pode ver); só o admin máximo define
drop policy if exists "rotina_itens_select" on public.rotina_itens;
create policy "rotina_itens_select" on public.rotina_itens for select
  using (public.current_user_role() in ('admin', 'advogado'));
drop policy if exists "rotina_itens_super_write" on public.rotina_itens;
create policy "rotina_itens_super_write" on public.rotina_itens for all
  using (public.current_user_super())
  with check (public.current_user_super());

-- cada um marca/desmarca o próprio; o admin máximo pode corrigir
drop policy if exists "rotina_feitos_select" on public.rotina_feitos;
create policy "rotina_feitos_select" on public.rotina_feitos for select
  using (public.current_user_role() in ('admin', 'advogado'));
drop policy if exists "rotina_feitos_write" on public.rotina_feitos;
create policy "rotina_feitos_write" on public.rotina_feitos for all
  using (responsavel_id = public.meu_responsavel_id() or public.current_user_super())
  with check (responsavel_id = public.meu_responsavel_id() or public.current_user_super());

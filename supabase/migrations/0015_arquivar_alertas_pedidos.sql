-- Arquivar (além de excluir), alertas de prazo por e-mail e documentos pedidos
-- ao cliente (out/2026). Aditiva.

-- 1) Arquivar: some das listas, mas pode voltar. Nulo = ativo na lista.
alter table public.activities add column if not exists archived_at timestamptz;
alter table public.clients add column if not exists archived_at timestamptz;
create index if not exists activities_archived_at_idx on public.activities (archived_at);

-- 2) Alertas de prazo: guarda o que já foi enviado para não mandar repetido.
--    tipo: 'antes' (prazo chegando), 'dia' (vence hoje), 'atrasada'.
create table if not exists public.activity_deadline_alerts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  tipo text not null check (tipo in ('antes', 'dia', 'atrasada')),
  deadline date not null,
  sent_to text not null,
  sent_at timestamptz not null default now(),
  unique (activity_id, tipo, deadline)
);
alter table public.activity_deadline_alerts enable row level security;
create policy "activity_deadline_alerts_admin_select" on public.activity_deadline_alerts for select
  using (public.current_user_role() = 'admin');

-- 3) Documento enviado pelo cliente em resposta a um item pedido na Ficha de
--    Handoff (seção 11, ex.: "Contrato Social").
alter table public.documents add column if not exists requested_item text;

-- 4) Privacidade: a Ficha de Handoff e a triagem antiga saem da tabela clients
--    (o cliente logado consegue ler a própria linha de clients) e vão para
--    uma tabela só da equipe.
create table if not exists public.client_handoffs (
  client_id uuid primary key references public.clients (id) on delete cascade,
  handoff jsonb,
  handoff_updated_at timestamptz,
  triagem text,
  triagem_updated_at timestamptz
);
alter table public.client_handoffs enable row level security;
drop policy if exists "client_handoffs_admin_all" on public.client_handoffs;
create policy "client_handoffs_admin_all" on public.client_handoffs for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

insert into public.client_handoffs (client_id, handoff, handoff_updated_at, triagem, triagem_updated_at)
select id, handoff, handoff_updated_at, triagem, triagem_updated_at
from public.clients
where handoff is not null or triagem is not null
on conflict (client_id) do update
  set handoff = excluded.handoff, handoff_updated_at = excluded.handoff_updated_at,
      triagem = excluded.triagem, triagem_updated_at = excluded.triagem_updated_at;

update public.clients set handoff = null, handoff_updated_at = null, triagem = null, triagem_updated_at = null
where handoff is not null or triagem is not null;

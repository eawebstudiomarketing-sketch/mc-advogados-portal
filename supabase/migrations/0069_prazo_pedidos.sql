-- Prazo travado (05/11/2026): a equipe não muda mais o prazo de uma atividade
-- que já tem prazo. Ela pede (nova data + justificativa) e o admin máximo
-- (Maurício) aprova ou recusa. Pôr o PRIMEIRO prazo continua livre.
-- A trava é no banco: vale para tela, Assistente, MCP e qualquer outro caminho
-- que use o login da pessoa. O servidor (chave de serviço) aplica o aprovado.

create table if not exists public.prazo_pedidos (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  pedido_por uuid not null references public.profiles(id) on delete cascade,
  prazo_atual date,
  prazo_novo date,
  justificativa text not null check (length(trim(justificativa)) >= 5),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  decidido_por uuid references public.profiles(id) on delete set null,
  decidido_em timestamptz,
  resposta text,
  created_at timestamptz not null default now()
);

create index if not exists prazo_pedidos_status_idx on public.prazo_pedidos (status, created_at desc);
create index if not exists prazo_pedidos_atividade_idx on public.prazo_pedidos (activity_id, created_at desc);
-- um pedido aberto por atividade
create unique index if not exists prazo_pedidos_um_pendente on public.prazo_pedidos (activity_id) where status = 'pendente';

alter table public.prazo_pedidos enable row level security;

-- quem pediu vê os seus; o admin máximo vê todos. Gravação só pelo servidor.
drop policy if exists prazo_pedidos_ver on public.prazo_pedidos;
create policy prazo_pedidos_ver on public.prazo_pedidos for select to authenticated
  using (public.current_user_super() or pedido_por in (select id from public.profiles where user_id = auth.uid()));

-- a trava
create or replace function public.trava_prazo_atividade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and old.deadline is not null
     and new.deadline is distinct from old.deadline
     and not public.current_user_super() then
    raise exception 'PRAZO_TRAVADO: mudar o prazo precisa de autorização do Dr. Maurício (peça pela atividade).'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trava_prazo_atividade on public.activities;
create trigger trava_prazo_atividade
  before update of deadline on public.activities
  for each row execute function public.trava_prazo_atividade();

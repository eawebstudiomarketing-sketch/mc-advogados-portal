-- 0068 (04/11/2026): pedidos do João para criar atividade.
--  1. "Audiência" passa a ser um tipo de atividade (além de Consultoria, Processo,
--     Contrato, Reunião e Pesquisa). A atividade desse tipo entra na Agenda como
--     audiência (categoria), com os lembretes ao cliente que já existem.
--  2. Mensagem automática no WhatsApp criada junto com a atividade: a mensagem
--     agendada guarda de qual atividade veio.
alter type public.activity_type add value if not exists 'audiencia';

alter table public.zap_agendamentos add column if not exists activity_id uuid references public.activities (id) on delete set null;
create index if not exists zap_agendamentos_activity_idx on public.zap_agendamentos (activity_id) where activity_id is not null;

--  3. Processo SEM cliente vinculado (83 de 199, quase todos vindos do Astrea) passa a
--     aparecer para quem tem acesso a Processos. Antes exigia "ver todos os clientes"
--     e nenhuma advogada tem: a Talita pesquisou um processo, o portal disse "já está
--     no portal" e ela não achava. Processo de cliente continua igual (só quem pode
--     ver aquele cliente).
create or replace function public.pode_ver_processo(pid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.processes p
    where p.id = pid
      and (
        public.pode_ver_cliente(p.client_id)
        or (p.client_id is null
            and public.current_user_role() in ('admin', 'advogado')
            and public.tem_permissao('processos'))
      )
  )
$$;

drop policy if exists "processes_sem_cliente_select" on public.processes;
create policy "processes_sem_cliente_select" on public.processes for select
  using (client_id is null and public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('processos'));
drop policy if exists "processes_sem_cliente_update" on public.processes;
create policy "processes_sem_cliente_update" on public.processes for update
  using (client_id is null and public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('processos'));

-- 0044 (26/10/2026): advogado vê SÓ o que é dele.
-- Decisão do usuário: Dra. Alice, Fran, Talita etc. enxergavam as atividades de
-- todos (bastava o cliente estar designado a elas). Agora:
--  * atividade: só quem é responsável, está como envolvido, ou criou a atividade
--    (quem cria uma tarefa para outra pessoa continua vendo o que criou);
--  * reunião (compromisso): só quem criou ou participa;
--  * Distribuição: itens PENDENTES aparecem para todos com a permissão; depois de
--    distribuído (aprovado) só vê quem enxerga a atividade; descartado só quem decidiu.
-- Admin máximo (Maurício e Suporte) continua vendo tudo; o resto do sistema
-- (clientes, documentos, processos) não muda.

-- quem criou a atividade (para quem cria para outra pessoa não perder de vista)
alter table public.activities add column if not exists criado_por uuid references public.profiles (id) on delete set null;
alter table public.activities alter column criado_por set default public.current_profile_id();
create index if not exists activities_criado_por_idx on public.activities (criado_por);

create or replace function public.pode_ver_atividade_env(cid uuid, autor uuid, resp uuid, envs uuid[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() in ('admin', 'advogado')
    and (
      public.current_user_super()
      -- admin comum: continua pelos clientes dele
      or (public.current_user_role() = 'admin' and (public.tem_permissao('todos_clientes') or public.pode_ver_cliente(cid)))
      -- advogado: só o que é dele
      or autor = public.current_profile_id()
      or (resp is not null and resp = public.meu_responsavel_id())
      or (public.meu_responsavel_id() is not null and public.meu_responsavel_id() = any (coalesce(envs, '{}')))
    )
$$;
grant execute on function public.pode_ver_atividade_env(uuid, uuid, uuid, uuid[]) to authenticated;

drop policy if exists "activities_equipe_select" on public.activities;
create policy "activities_equipe_select" on public.activities for select
  using (public.pode_ver_atividade_env(client_id, responsible_id, responsavel_id, envolvidos) or criado_por = public.current_profile_id());

-- passar a atividade para outra pessoa precisa continuar funcionando: o novo estado
-- não precisa ser visível para quem passou (só quem já enxerga a atividade pode mexer nela)
drop policy if exists "activities_equipe_update" on public.activities;
create policy "activities_equipe_update" on public.activities for update
  using (public.pode_ver_atividade_env(client_id, responsible_id, responsavel_id, envolvidos) or criado_por = public.current_profile_id())
  with check (public.current_user_role() in ('admin', 'advogado'));

drop policy if exists "activities_equipe_delete" on public.activities;
create policy "activities_equipe_delete" on public.activities for delete
  using ((public.pode_ver_atividade_env(client_id, responsible_id, responsavel_id, envolvidos) or criado_por = public.current_profile_id()) and public.tem_permissao('excluir'));

-- reunião: só quem criou ou participa (admin continua vendo todas)
create or replace function public.pode_ver_compromisso(cid uuid, parts uuid[], autor uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'admin'
    or (public.current_user_role() = 'advogado' and (
      autor = public.current_profile_id()
      or (public.meu_responsavel_id() is not null and public.meu_responsavel_id() = any (coalesce(parts, '{}')))
    ))
$$;
grant execute on function public.pode_ver_compromisso(uuid, uuid[], uuid) to authenticated;

-- Distribuição: pendentes para todos; depois de distribuído, só quem está envolvido
drop policy if exists "distribuicao_equipe_all" on public.distribuicao;
create policy "distribuicao_equipe_all" on public.distribuicao for all
  using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'advogado' and public.tem_permissao('distribuicao') and (
      status = 'pendente'
      or tratado_por = public.current_profile_id()
      or (activity_id is not null and public.pode_ver_atividade_id(activity_id))
    ))
  )
  with check (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'advogado' and public.tem_permissao('distribuicao'))
  );

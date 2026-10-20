-- 0027 (out/2026): envolvidos na atividade + atividades respeitam os clientes de cada admin.
--
--  * activities.envolvidos: pessoas (responsaveis.id) envolvidas além do
--    responsável. Decisão do usuário (20/10): envolvido = IGUAL ao responsável
--    (vê, edita, aparece na agenda/rotina dele e recebe aviso).
--  * pode_ver_atividade: admin comum com clientes restritos (0026) passa a ver
--    só as atividades dos clientes dele (antes todo admin via tudo aqui).

alter table public.activities add column if not exists envolvidos uuid[] not null default '{}';
create index if not exists activities_envolvidos_idx on public.activities using gin (envolvidos);

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
      or (public.current_user_role() = 'admin' and public.tem_permissao('todos_clientes'))
      or public.pode_ver_cliente(cid)
      or (cid is null and autor = public.current_profile_id())
      or (resp is not null and resp = public.meu_responsavel_id())
      or (public.meu_responsavel_id() is not null and public.meu_responsavel_id() = any (coalesce(envs, '{}')))
    )
$$;
grant execute on function public.pode_ver_atividade_env(uuid, uuid, uuid, uuid[]) to authenticated;

-- a versão antiga (3 argumentos) continua existindo para quem ainda chama
create or replace function public.pode_ver_atividade(cid uuid, autor uuid, resp uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.pode_ver_atividade_env(cid, autor, resp, '{}')
$$;

create or replace function public.pode_ver_atividade_id(aid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.activities a
    where a.id = aid and public.pode_ver_atividade_env(a.client_id, a.responsible_id, a.responsavel_id, a.envolvidos)
  )
$$;

drop policy if exists "activities_equipe_select" on public.activities;
create policy "activities_equipe_select" on public.activities for select
  using (public.pode_ver_atividade_env(client_id, responsible_id, responsavel_id, envolvidos));
drop policy if exists "activities_equipe_update" on public.activities;
create policy "activities_equipe_update" on public.activities for update
  using (public.pode_ver_atividade_env(client_id, responsible_id, responsavel_id, envolvidos))
  with check (public.pode_ver_atividade_env(client_id, responsible_id, responsavel_id, envolvidos));
drop policy if exists "activities_equipe_delete" on public.activities;
create policy "activities_equipe_delete" on public.activities for delete
  using (public.pode_ver_atividade_env(client_id, responsible_id, responsavel_id, envolvidos) and public.tem_permissao('excluir'));

-- entrou como envolvido → aviso para a pessoa (se tiver login e não for ela quem mudou)
create or replace function public.avisa_novos_envolvidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cliente text;
begin
  select name into cliente from public.clients where id = new.client_id;
  insert into public.avisos (profile_id, tipo, titulo, corpo, url)
  select r.profile_id, 'responsavel', 'Você foi incluído numa atividade',
         new.title || coalesce(' — ' || cliente, ''), '/admin/activities/' || new.id
  from public.responsaveis r
  where r.id = any (new.envolvidos)
    and (tg_op = 'INSERT' or not (r.id = any (coalesce(old.envolvidos, '{}'))))
    and r.profile_id is not null
    and r.profile_id is distinct from public.current_profile_id()
    and r.id is distinct from new.responsavel_id;
  return new;
end;
$$;
drop trigger if exists activities_avisa_envolvidos on public.activities;
create trigger activities_avisa_envolvidos
  after insert or update of envolvidos on public.activities
  for each row execute function public.avisa_novos_envolvidos();

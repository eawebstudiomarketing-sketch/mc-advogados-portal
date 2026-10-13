-- 0017 (out/2026): equipe com permissões e clientes divididos por advogado.
--
-- Regras:
--  * admin vê e faz tudo;
--  * advogado só enxerga os clientes designados a ele (equipe_clientes) e o
--    que o admin liberar (equipe_permissoes; chave ausente = liberado, exceto
--    'atividades_como_responsavel', que vem desligada);
--  * advogado nunca acessa financeiro, equipe, integrações e lixeira;
--  * cliente sem advogado designado: só o admin vê;
--  * perfil com acesso desativado (ativo = false) perde todo acesso;
--  * perfil "oculto" (conta técnica) não aparece para ninguém além dele mesmo.

-- ───────────── perfis ─────────────
alter table public.profiles add column if not exists ativo boolean not null default true;
alter table public.profiles add column if not exists oculto boolean not null default false;

-- Perfil desativado deixa de ter papel: todas as regras abaixo passam a negar.
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where user_id = auth.uid() and ativo
$$;

create or replace function public.current_user_oculto()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select oculto from public.profiles where user_id = auth.uid() and ativo), false)
$$;

-- ───────────── clientes de cada advogado ─────────────
create table public.equipe_clientes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- adiada até o fim da transação: o gatilho de "cliente criado por advogado"
  -- grava a designação ANTES da linha do cliente existir
  client_id uuid not null references public.clients (id) on delete cascade deferrable initially deferred,
  created_at timestamptz not null default now(),
  primary key (profile_id, client_id)
);
create index equipe_clientes_client_idx on public.equipe_clientes (client_id);

-- ───────────── o que cada advogado pode ver/fazer ─────────────
create table public.equipe_permissoes (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  permissoes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.pode_ver_cliente(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when cid is null then false
    when public.current_user_role() = 'admin' then true
    when public.current_user_role() = 'advogado' then exists (
      select 1 from public.equipe_clientes ec
      where ec.profile_id = public.current_profile_id() and ec.client_id = cid
    )
    else false
  end
$$;

create or replace function public.tem_permissao(chave text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.current_user_role() = 'admin' then true
    when public.current_user_role() = 'advogado' then coalesce(
      (select (ep.permissoes ->> chave)::boolean from public.equipe_permissoes ep where ep.profile_id = public.current_profile_id()),
      chave <> 'atividades_como_responsavel'
    )
    else false
  end
$$;

create or replace function public.meu_responsavel_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.responsaveis where profile_id = public.current_profile_id()
$$;

-- caminho no Storage: {cliente}/..., internal/{cliente}/..., internal/chat/{perfil}/...
create or replace function public.pode_ver_pasta(caminho text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  p text[] := string_to_array(caminho, '/');
begin
  if public.current_user_role() = 'admin' then return true; end if;
  if public.current_user_role() <> 'advogado' then return false; end if;
  if p[1] = 'internal' then
    if p[2] = 'chat' then return p[3] = public.current_profile_id()::text; end if;
    return exists (select 1 from public.equipe_clientes ec where ec.profile_id = public.current_profile_id() and ec.client_id::text = p[2]);
  end if;
  return exists (select 1 from public.equipe_clientes ec where ec.profile_id = public.current_profile_id() and ec.client_id::text = p[1]);
end;
$$;

grant execute on function public.current_user_oculto() to authenticated;
grant execute on function public.pode_ver_cliente(uuid) to authenticated;
grant execute on function public.tem_permissao(text) to authenticated;
grant execute on function public.meu_responsavel_id() to authenticated;
grant execute on function public.pode_ver_pasta(text) to authenticated;

alter table public.equipe_clientes enable row level security;
create policy "equipe_clientes_select" on public.equipe_clientes for select
  using (public.current_user_role() = 'admin' or profile_id = public.current_profile_id());
create policy "equipe_clientes_admin_write" on public.equipe_clientes for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter table public.equipe_permissoes enable row level security;
create policy "equipe_permissoes_select" on public.equipe_permissoes for select
  using (public.current_user_role() = 'admin' or profile_id = public.current_profile_id());
create policy "equipe_permissoes_admin_write" on public.equipe_permissoes for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Cliente criado por advogado já nasce designado a ele.
create or replace function public.clients_designa_criador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() = 'advogado' then
    insert into public.equipe_clientes (profile_id, client_id)
    values (public.current_profile_id(), new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger clients_designa_criador
  before insert on public.clients
  for each row execute function public.clients_designa_criador();

-- ───────────── clients ─────────────
drop policy if exists "clients_select" on public.clients;
drop policy if exists "clients_admin_write" on public.clients;
create policy "clients_select" on public.clients for select
  using (public.pode_ver_cliente(id) or id = public.current_user_client_id());
create policy "clients_insert" on public.clients for insert
  with check (public.current_user_role() = 'admin' or (public.current_user_role() = 'advogado' and public.tem_permissao('criar_cliente')));
create policy "clients_update" on public.clients for update
  using (public.pode_ver_cliente(id) and public.tem_permissao('editar_cliente'))
  with check (public.pode_ver_cliente(id) and public.tem_permissao('editar_cliente'));
create policy "clients_delete" on public.clients for delete
  using (public.pode_ver_cliente(id) and public.tem_permissao('excluir'));

-- ───────────── profiles (conta oculta some para os outros) ─────────────
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (
    user_id = auth.uid()
    or (
      public.current_user_role() in ('admin', 'advogado')
      and (not oculto or public.current_user_oculto())
      and (role <> 'client' or public.pode_ver_cliente(client_id))
    )
  );
create policy "profiles_admin_write" on public.profiles for all
  using (public.current_user_role() = 'admin' and (not oculto or public.current_user_oculto()))
  with check (public.current_user_role() = 'admin' and (not oculto or public.current_user_oculto()));

-- ───────────── tabelas operacionais por cliente ─────────────
do $$
declare
  t text;
begin
  foreach t in array array['time_entries', 'processes', 'documents', 'contracts']
  loop
    execute format('drop policy if exists "%1$s_staff_all" on public.%1$s', t);
    execute format('create policy "%1$s_equipe_select" on public.%1$s for select using (public.pode_ver_cliente(client_id))', t);
    execute format('create policy "%1$s_equipe_insert" on public.%1$s for insert with check (public.pode_ver_cliente(client_id))', t);
    execute format('create policy "%1$s_equipe_update" on public.%1$s for update using (public.pode_ver_cliente(client_id)) with check (public.pode_ver_cliente(client_id))', t);
    execute format('create policy "%1$s_equipe_delete" on public.%1$s for delete using (public.pode_ver_cliente(client_id) and public.tem_permissao(%2$L))', t, 'excluir');
  end loop;
end $$;

-- atividades: cliente designado; tarefa interna (sem cliente) de quem criou;
-- e, se o admin liberar, as atividades em que a pessoa é a responsável.
create or replace function public.pode_ver_atividade(cid uuid, autor uuid, resp uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'admin'
    or (
      public.current_user_role() = 'advogado'
      and (
        public.pode_ver_cliente(cid)
        or (cid is null and autor = public.current_profile_id())
        or (resp is not null and resp = public.meu_responsavel_id() and public.tem_permissao('atividades_como_responsavel'))
      )
    )
$$;
grant execute on function public.pode_ver_atividade(uuid, uuid, uuid) to authenticated;

drop policy if exists "activities_staff_all" on public.activities;
create policy "activities_equipe_select" on public.activities for select
  using (public.pode_ver_atividade(client_id, responsible_id, responsavel_id));
create policy "activities_equipe_insert" on public.activities for insert
  with check (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'advogado' and (public.pode_ver_cliente(client_id) or client_id is null))
  );
create policy "activities_equipe_update" on public.activities for update
  using (public.pode_ver_atividade(client_id, responsible_id, responsavel_id))
  with check (public.pode_ver_atividade(client_id, responsible_id, responsavel_id));
create policy "activities_equipe_delete" on public.activities for delete
  using (public.pode_ver_atividade(client_id, responsible_id, responsavel_id) and public.tem_permissao('excluir'));

-- ───────────── relatórios, onboarding, demandas, ficha ─────────────
drop policy if exists "monthly_reports_select" on public.monthly_reports;
drop policy if exists "monthly_reports_admin_all" on public.monthly_reports;
create policy "monthly_reports_select" on public.monthly_reports for select
  using (public.pode_ver_cliente(client_id) or client_id = public.current_user_client_id());
create policy "monthly_reports_equipe_write" on public.monthly_reports for all
  using (public.pode_ver_cliente(client_id) and public.tem_permissao('relatorios'))
  with check (public.pode_ver_cliente(client_id) and public.tem_permissao('relatorios'));

drop policy if exists "onboardings_admin_all" on public.onboardings;
create policy "onboardings_equipe_all" on public.onboardings for all
  using (public.pode_ver_cliente(client_id) and public.tem_permissao('onboarding'))
  with check (public.pode_ver_cliente(client_id) and public.tem_permissao('onboarding'));

drop policy if exists "onboarding_demand_drafts_admin_all" on public.onboarding_demand_drafts;
create policy "onboarding_demand_drafts_equipe_all" on public.onboarding_demand_drafts for all
  using (public.pode_ver_cliente(client_id) and public.tem_permissao('demandas'))
  with check (public.pode_ver_cliente(client_id) and public.tem_permissao('demandas'));

drop policy if exists "client_handoffs_admin_all" on public.client_handoffs;
create policy "client_handoffs_equipe_all" on public.client_handoffs for all
  using (public.pode_ver_cliente(client_id) and public.tem_permissao('ficha_handoff'))
  with check (public.pode_ver_cliente(client_id) and public.tem_permissao('ficha_handoff'));

drop policy if exists "onboarding_perguntas_modelo_admin_all" on public.onboarding_perguntas_modelo;
create policy "onboarding_perguntas_modelo_select" on public.onboarding_perguntas_modelo for select
  using (public.tem_permissao('onboarding'));
create policy "onboarding_perguntas_modelo_admin_write" on public.onboarding_perguntas_modelo for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ───────────── responsáveis (conta oculta não aparece) ─────────────
drop policy if exists "responsaveis_equipe_all" on public.responsaveis;
create policy "responsaveis_equipe_all" on public.responsaveis for all
  using (
    public.current_user_role() in ('admin', 'advogado')
    and (profile_id is null or public.current_user_oculto()
         or not exists (select 1 from public.profiles p where p.id = profile_id and p.oculto))
  )
  with check (public.current_user_role() in ('admin', 'advogado'));

create or replace function public.sync_responsavel_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.oculto then
    delete from public.responsaveis where profile_id = new.id;
    return new;
  end if;
  if new.role in ('admin', 'advogado') and new.email is not null then
    update public.responsaveis
       set profile_id = new.id
     where lower(email) = lower(new.email) and (profile_id is null or profile_id = new.id);
    if not found then
      insert into public.responsaveis (nome, email, profile_id)
      values (new.full_name, new.email, new.id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_sync_responsavel on public.profiles;
create trigger profiles_sync_responsavel
  after insert or update of role, email, oculto on public.profiles
  for each row execute function public.sync_responsavel_profile();

-- ───────────── arquivos (bucket documents) ─────────────
drop policy if exists "documents_bucket_select" on storage.objects;
drop policy if exists "documents_bucket_staff_write" on storage.objects;
drop policy if exists "documents_bucket_staff_update" on storage.objects;
drop policy if exists "documents_bucket_staff_delete" on storage.objects;
create policy "documents_bucket_select" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (public.pode_ver_pasta(name) or (storage.foldername(name))[1] = public.current_user_client_id()::text)
  );
create policy "documents_bucket_staff_write" on storage.objects for insert
  with check (bucket_id = 'documents' and public.pode_ver_pasta(name));
create policy "documents_bucket_staff_update" on storage.objects for update
  using (bucket_id = 'documents' and public.pode_ver_pasta(name))
  with check (bucket_id = 'documents' and public.pode_ver_pasta(name));
create policy "documents_bucket_staff_delete" on storage.objects for delete
  using (bucket_id = 'documents' and public.pode_ver_pasta(name));

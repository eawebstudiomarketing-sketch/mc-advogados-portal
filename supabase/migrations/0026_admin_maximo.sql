-- 0026 (out/2026): admin máximo e permissões também para os outros admins.
--
-- Regras novas:
--  * "admin máximo" (profiles.super_admin): Maurício e a conta Suporte. Vê e
--    faz tudo e é o ÚNICO que muda o que cada pessoa vê (permissões e clientes);
--  * os outros admins passam a respeitar as permissões salvas para eles
--    (sem nada salvo = tudo liberado, como antes);
--  * advogado: como antes, mais chaves novas que começam DESLIGADAS
--    (todos_clientes, financeiro, whatsapp, equipe, integracoes, lixeira);
--  * "todos_clientes": vê todos os clientes, não só os designados
--    (admin: ligado por padrão; advogado: desligado).

alter table public.profiles add column if not exists super_admin boolean not null default false;

update public.profiles set super_admin = true
  where role = 'admin' and email in ('mauriciocardosof.adv@gmail.com', 'eawebstudiomarketing@gmail.com');

create or replace function public.current_user_super()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select super_admin from public.profiles where user_id = auth.uid() and ativo and role = 'admin'), false)
$$;
grant execute on function public.current_user_super() to authenticated;

-- só o admin máximo (ou o servidor) liga/desliga super_admin
create or replace function public.protege_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.super_admin is distinct from (case when tg_op = 'INSERT' then false else old.super_admin end)
     and auth.uid() is not null and not public.current_user_super() then
    raise exception 'Só o admin máximo pode mudar isso.';
  end if;
  return new;
end
$$;
drop trigger if exists profiles_protege_super on public.profiles;
create trigger profiles_protege_super before insert or update on public.profiles
  for each row execute function public.protege_super_admin();

create or replace function public.tem_permissao(chave text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.current_user_super() then true
    when public.current_user_role() in ('admin', 'advogado') then coalesce(
      (select (ep.permissoes ->> chave)::boolean from public.equipe_permissoes ep where ep.profile_id = public.current_profile_id()),
      public.current_user_role() = 'admin'
        or chave not in ('atividades_como_responsavel', 'ver_equipe', 'todos_clientes', 'financeiro', 'whatsapp', 'equipe', 'integracoes', 'lixeira')
    )
    else false
  end
$$;

create or replace function public.pode_ver_cliente(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when cid is null then false
    when public.current_user_role() in ('admin', 'advogado') then
      public.tem_permissao('todos_clientes') or exists (
        select 1 from public.equipe_clientes ec
        where ec.profile_id = public.current_profile_id() and ec.client_id = cid
      )
    else false
  end
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
  if public.current_user_role() not in ('admin', 'advogado') then return false; end if;
  if public.current_user_role() = 'admin' and public.tem_permissao('todos_clientes') then return true; end if;
  if p[1] = 'internal' then
    if p[2] = 'chat' then return p[3] = public.current_profile_id()::text; end if;
    return public.tem_permissao('todos_clientes') or exists (select 1 from public.equipe_clientes ec where ec.profile_id = public.current_profile_id() and ec.client_id::text = p[2]);
  end if;
  return public.tem_permissao('todos_clientes') or exists (select 1 from public.equipe_clientes ec where ec.profile_id = public.current_profile_id() and ec.client_id::text = p[1]);
end;
$$;

-- só o admin máximo muda permissões e clientes de cada pessoa
drop policy if exists "equipe_clientes_admin_write" on public.equipe_clientes;
create policy "equipe_clientes_admin_write" on public.equipe_clientes for all
  using (public.current_user_super())
  with check (public.current_user_super());

drop policy if exists "equipe_permissoes_admin_write" on public.equipe_permissoes;
create policy "equipe_permissoes_admin_write" on public.equipe_permissoes for all
  using (public.current_user_super())
  with check (public.current_user_super());

-- Financeiro e WhatsApp: quem tem a permissão (admin, por padrão; advogado, se liberado)
drop policy if exists "financial_records_admin_all" on public.financial_records;
create policy "financial_records_admin_all" on public.financial_records for all
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('financeiro'))
  with check (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('financeiro'));

drop policy if exists "financial_notifications_admin_all" on public.financial_notifications;
create policy "financial_notifications_admin_all" on public.financial_notifications for all
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('financeiro'))
  with check (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('financeiro'));

drop policy if exists "wa_agent_admin_select" on public.wa_agent;
create policy "wa_agent_admin_select" on public.wa_agent for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'));

drop policy if exists "wa_chats_admin_all" on public.wa_chats;
create policy "wa_chats_admin_all" on public.wa_chats for all
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'))
  with check (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'));

drop policy if exists "wa_messages_admin_all" on public.wa_messages;
create policy "wa_messages_admin_all" on public.wa_messages for all
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'))
  with check (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'));

drop policy if exists "wa_jobs_admin_all" on public.wa_jobs;
create policy "wa_jobs_admin_all" on public.wa_jobs for all
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'))
  with check (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'));

drop policy if exists "leads_admin_all" on public.leads;
create policy "leads_admin_all" on public.leads for all
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'))
  with check (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'));

drop policy if exists "wa_contatos_admin_select" on public.wa_contatos;
create policy "wa_contatos_admin_select" on public.wa_contatos for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'));

drop policy if exists "whatsapp_media_admin_select" on storage.objects;
create policy "whatsapp_media_admin_select" on storage.objects for select
  using (bucket_id = 'whatsapp' and public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('whatsapp'));

-- perfil do admin máximo só é alterado por um admin máximo
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles for all
  using (public.current_user_role() = 'admin' and (not oculto or public.current_user_oculto()) and (not super_admin or public.current_user_super()))
  with check (public.current_user_role() = 'admin' and (not oculto or public.current_user_oculto()) and (not super_admin or public.current_user_super()));

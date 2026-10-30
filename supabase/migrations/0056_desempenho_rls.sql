-- 0056 (30/10/2026): desempenho das regras de segurança (RLS), sem mudar quem vê o quê.
--
-- Antes: cada linha lida chamava current_user_role(), tem_permissao(), pode_ver_cliente()...
-- e cada uma consultava profiles / equipe_permissoes / equipe_clientes de novo. Numa lista
-- de 600 andamentos eram milhares de consultas (contar andamentos novos: 0,9 s com RLS contra
-- 0,2 s sem; para um advogado, 1,8 s).
-- Agora: os dados do usuário são lidos UMA vez por transação (cada pedido do site é uma
-- transação) e guardados numa configuração local da transação (set_config(..., true), que
-- some no fim dela). As funções continuam com o mesmo nome, os mesmos parâmetros e a mesma
-- lógica, então todas as políticas existentes passam a usar a versão rápida sozinhas.

-- dados do usuário logado, lidos uma vez por transação
create or replace function public._sessao()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  guardado text := current_setting('mc.sessao', true);
  r jsonb;
begin
  if guardado is not null and guardado <> '' then
    r := guardado::jsonb;
    if (r ->> 'uid') is not distinct from coalesce(u::text, '') then
      return r;
    end if;
  end if;

  select jsonb_build_object(
           'uid', coalesce(u::text, ''),
           'role', p.role,
           'ativo', p.ativo,
           'pid', p.id,
           'super', coalesce(p.super_admin, false),
           'cid', p.client_id,
           'perm', (select ep.permissoes from public.equipe_permissoes ep where ep.profile_id = p.id),
           'resp', (select rr.id from public.responsaveis rr where rr.profile_id = p.id limit 1),
           'clientes', coalesce((select jsonb_agg(ec.client_id) from public.equipe_clientes ec where ec.profile_id = p.id), '[]'::jsonb)
         )
    into r
    from public.profiles p
   where p.user_id = u;

  if r is null then
    r := jsonb_build_object('uid', coalesce(u::text, ''), 'clientes', '[]'::jsonb);
  end if;
  perform set_config('mc.sessao', r::text, true);
  return r;
end;
$$;
revoke all on function public._sessao() from public, anon, authenticated;

-- mesmas regras de antes, agora lendo os dados guardados
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select case when (s ->> 'ativo')::boolean then (s ->> 'role')::public.user_role end
    from (select public._sessao() as s) x
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select (public._sessao() ->> 'pid')::uuid
$$;

create or replace function public.current_user_super()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((s ->> 'ativo')::boolean and (s ->> 'role') = 'admin' and (s ->> 'super')::boolean, false)
    from (select public._sessao() as s) x
$$;

create or replace function public.current_user_client_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select (public._sessao() ->> 'cid')::uuid
$$;

create or replace function public.meu_responsavel_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select (public._sessao() ->> 'resp')::uuid
$$;

create or replace function public.tem_permissao(chave text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  s jsonb := public._sessao();
  papel text := case when (s ->> 'ativo')::boolean then s ->> 'role' end;
begin
  if public.current_user_super() then
    return true;
  end if;
  if papel in ('admin', 'advogado') then
    return coalesce(
      (s -> 'perm' ->> chave)::boolean,
      papel = 'admin'
        or chave not in ('atividades_como_responsavel', 'ver_equipe', 'todos_clientes', 'financeiro', 'whatsapp', 'equipe', 'integracoes', 'lixeira')
    );
  end if;
  return false;
end;
$$;

create or replace function public.pode_ver_cliente(cid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if cid is null then
    return false;
  end if;
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'advogado') then
    return false;
  end if;
  if not (public.tem_permissao('todos_clientes') or (public._sessao() -> 'clientes') ? cid::text) then
    return false;
  end if;
  if public.tem_permissao('clientes_pf') then
    return true;
  end if;
  return not exists (select 1 from public.clients c where c.id = cid and c.tipo_pessoa = 'PF');
end;
$$;

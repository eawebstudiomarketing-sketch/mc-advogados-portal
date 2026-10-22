-- Clientes pessoa física (22/10/2026): mesma tabela clients, separados por
-- tipo_pessoa. Cadastro PF com os campos do Astrea (aba "Cadastro" do contato)
-- e permissão própria "clientes_pf". Aditiva.

-- 1) PF vindo do Astrea quase nunca tem CPF/e-mail preenchidos: deixam de ser
--    obrigatórios (o CPF continua único quando informado).
alter table public.clients alter column documento drop not null;
alter table public.clients alter column email_contact drop not null;

-- 2) Cadastro da pessoa física (como no Astrea).
alter table public.clients
  add column if not exists apelido text,
  add column if not exists nascimento date,
  add column if not exists estado_civil text,
  add column if not exists rg text,
  add column if not exists ctps text,
  add column if not exists pis text,
  add column if not exists titulo_eleitor text,
  add column if not exists cnh text,
  add column if not exists passaporte text,
  add column if not exists reservista text,
  add column if not exists profissao text,          -- "Atividade econômica" no Astrea
  add column if not exists nome_pai text,
  add column if not exists nome_mae text,
  add column if not exists naturalidade text,
  add column if not exists nacionalidade text,
  add column if not exists comentarios text,
  add column if not exists telefones text[] not null default '{}',
  add column if not exists endereco jsonb,          -- {cep, logradouro, numero, complemento, bairro, cidade, uf}
  add column if not exists conta_bancaria jsonb,    -- {banco, agencia, conta, pix}
  add column if not exists falecido boolean not null default false,
  add column if not exists data_obito date,
  add column if not exists astrea_contato_id text unique;

-- 3) Quem vê cliente PF: além da regra de sempre, precisa da permissão "clientes_pf".
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
      (public.tem_permissao('todos_clientes') or exists (
        select 1 from public.equipe_clientes ec
        where ec.profile_id = public.current_profile_id() and ec.client_id = cid
      ))
      and (
        public.tem_permissao('clientes_pf')
        or not exists (select 1 from public.clients c where c.id = cid and c.tipo_pessoa = 'PF')
      )
    else false
  end
$$;

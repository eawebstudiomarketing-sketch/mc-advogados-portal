-- 0023 (out/2026): Distribuição, compromissos na agenda, cliente ↔ WhatsApp,
-- lembretes e rotina pelo Zap, áreas de atuação e ranking. Aditiva.
--
--  * responsaveis ganham telefone, áreas e "rotina no Zap";
--  * clients ganham nomes de grupo e números do WhatsApp; o banco vincula
--    sozinho a conversa (wa_chats) que bater com eles;
--  * distribuicao: caixa de demandas que vêm de fora (Zap, portal do cliente);
--  * compromissos: reunião/ligação/evento na agenda (não são atividades);
--  * escritorio_config: áreas de atuação e textos dos lembretes ao cliente;
--  * activities ganham área e data de conclusão (ranking).

-- ───────────── pessoas: telefone, áreas, rotina ─────────────
alter table public.responsaveis add column if not exists telefone text;
alter table public.responsaveis add column if not exists areas text[] not null default '{}';
alter table public.responsaveis add column if not exists rotina_zap boolean not null default true;

-- ───────────── configuração do escritório ─────────────
create table if not exists public.escritorio_config (
  id int primary key default 1 check (id = 1),
  areas text[] not null default array['Trabalhista', 'Empresarial', 'Contratos', 'Marcas e Patentes', 'Tributário', 'Cível', 'Consumidor', 'Previdenciário'],
  lembrete_24h text not null default 'Olá! Passando para lembrar: amanhã, {data}, às {hora}, temos {titulo} com a MC Advogados.{local}',
  lembrete_1h text not null default 'Olá! Daqui a 1 hora, às {hora}, temos {titulo} com a MC Advogados.{local} Até já!',
  lembretes_ativos boolean not null default true,
  rotina_ativa boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.escritorio_config (id) values (1) on conflict (id) do nothing;

alter table public.escritorio_config enable row level security;
create policy "escritorio_config_equipe_select" on public.escritorio_config for select
  using (public.current_user_role() in ('admin', 'advogado'));
create policy "escritorio_config_admin_update" on public.escritorio_config for update
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

-- ───────────── atividades: área e conclusão ─────────────
alter table public.activities add column if not exists area text;
alter table public.activities add column if not exists concluida_em timestamptz;
update public.activities set concluida_em = updated_at where status = 'concluida' and concluida_em is null;
create index if not exists activities_concluida_idx on public.activities (concluida_em desc) where concluida_em is not null;

create or replace function public.marca_conclusao()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    new.concluida_em := now();
  elsif new.status <> 'concluida' then
    new.concluida_em := null;
  end if;
  return new;
end
$$;
drop trigger if exists activities_marca_conclusao on public.activities;
create trigger activities_marca_conclusao before insert or update of status on public.activities
  for each row execute function public.marca_conclusao();

alter table public.onboarding_demand_drafts add column if not exists area text;

-- ───────────── cliente ↔ WhatsApp ─────────────
alter table public.clients add column if not exists whatsapp_grupos text[] not null default '{}';
alter table public.clients add column if not exists whatsapp_numeros text[] not null default '{}';
alter table public.wa_chats add column if not exists vinculo_auto boolean not null default false;
alter table public.wa_chats add column if not exists demandas_lidas_ate timestamptz;

-- texto comparável: minúsculo, sem acento, espaços simples
create or replace function public.txt_comparavel(t text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g'))
$$;

-- telefone → "DDD + 8 últimos dígitos" (ignora 55 e o 9º dígito)
create or replace function public.tel_chave(t text)
returns text
language sql
immutable
as $$
  with d as (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as n),
       s as (select case when length(n) >= 12 and left(n, 2) = '55' then substr(n, 3) else n end as n from d)
  select case when length(n) >= 10 then left(n, 2) || right(n, 8) else null end from s
$$;

-- qual cliente combina com esta conversa (grupo pelo nome; contato pelo número)
create or replace function public.cliente_do_chat(jid text, nome text, grupo boolean)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id from public.clients c
  where c.archived_at is null and (
    (grupo and public.txt_comparavel(nome) <> '' and exists (
      select 1 from unnest(c.whatsapp_grupos) g where public.txt_comparavel(g) = public.txt_comparavel(nome)))
    or (not grupo and jid like '%@s.whatsapp.net' and exists (
      select 1 from unnest(c.whatsapp_numeros) n where public.tel_chave(n) = public.tel_chave(split_part(jid, '@', 1))))
  )
  order by c.created_at
  limit 1
$$;

-- conversa nova ou renomeada: vincula sozinha se ainda não tem cliente
create or replace function public.wa_chat_vincula()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid;
begin
  if tg_op = 'UPDATE' then
    -- o próprio banco refazendo vínculos (muda vinculo_auto junto): aceita como veio
    if new.vinculo_auto is distinct from old.vinculo_auto then
      return new;
    end if;
    -- alguém trocou o cliente à mão na tela do WhatsApp: vale o manual
    if new.client_id is distinct from old.client_id then
      new.vinculo_auto := false;
      return new;
    end if;
  end if;
  if new.client_id is null or new.vinculo_auto then
    cid := public.cliente_do_chat(new.chat_jid, new.nome, new.is_group);
    if cid is not null then
      new.client_id := cid;
      new.vinculo_auto := true;
    elsif new.vinculo_auto then
      new.client_id := null;
      new.vinculo_auto := false;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists wa_chats_vincula on public.wa_chats;
create trigger wa_chats_vincula before insert or update of nome, client_id on public.wa_chats
  for each row execute function public.wa_chat_vincula();

-- mudou o grupo/número na ficha: refaz os vínculos automáticos
create or replace function public.cliente_revincula_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- solta os automáticos que eram deste cliente e reavalia todos os soltos
  update public.wa_chats set client_id = null, vinculo_auto = false
    where client_id = new.id and vinculo_auto;
  update public.wa_chats w set client_id = public.cliente_do_chat(w.chat_jid, w.nome, w.is_group), vinculo_auto = true
    where w.client_id is null and public.cliente_do_chat(w.chat_jid, w.nome, w.is_group) is not null;
  return null;
end
$$;
drop trigger if exists clients_revincula_whatsapp on public.clients;
create trigger clients_revincula_whatsapp after insert or update of whatsapp_grupos, whatsapp_numeros, archived_at on public.clients
  for each row execute function public.cliente_revincula_whatsapp();

-- ───────────── Distribuição ─────────────
create table if not exists public.distribuicao (
  id uuid primary key default gen_random_uuid(),
  origem text not null default 'whatsapp' check (origem in ('whatsapp', 'portal_cliente', 'email', 'outro')),
  client_id uuid references public.clients (id) on delete cascade,
  titulo text not null,
  descricao text,
  area text,
  tipo text, -- tipo de atividade sugerido (consultoria, contrato...)
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  prazo_sugerido date,
  responsavel_sugerido uuid references public.responsaveis (id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente', 'aceita', 'descartada')),
  activity_id uuid references public.activities (id) on delete set null,
  chat_jid text,
  trechos jsonb not null default '[]'::jsonb, -- [{texto, quem, em}] mensagens que originaram
  tratado_por uuid references public.profiles (id) on delete set null,
  tratado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists distribuicao_status_idx on public.distribuicao (status, created_at desc);
create index if not exists distribuicao_activity_idx on public.distribuicao (activity_id);

alter table public.distribuicao enable row level security;
create policy "distribuicao_equipe_all" on public.distribuicao for all
  using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'advogado' and public.tem_permissao('distribuicao')
        and (client_id is null or public.pode_ver_cliente(client_id)))
  )
  with check (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'advogado' and public.tem_permissao('distribuicao')
        and (client_id is null or public.pode_ver_cliente(client_id)))
  );

-- pedido aberto pelo cliente no portal dele entra na Distribuição
create or replace function public.distribui_pedido_do_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.responsible_id and p.role = 'client') then
    insert into public.distribuicao (origem, client_id, titulo, descricao, prazo_sugerido, activity_id)
    values ('portal_cliente', new.client_id, new.title, new.description, new.deadline, new.id);
  end if;
  return new;
end
$$;
drop trigger if exists activities_distribui_pedido on public.activities;
create trigger activities_distribui_pedido after insert on public.activities
  for each row execute function public.distribui_pedido_do_cliente();

-- ───────────── Compromissos (agenda) ─────────────
create table if not exists public.compromissos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text not null default 'reuniao' check (tipo in ('reuniao', 'ligacao', 'evento', 'outro')),
  inicio timestamptz not null,
  fim timestamptz,
  local text,
  descricao text,
  client_id uuid references public.clients (id) on delete set null,
  participantes uuid[] not null default '{}', -- ids de responsaveis
  lembrar_cliente boolean not null default true,
  criado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compromissos_inicio_idx on public.compromissos (inicio);

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
      or public.meu_responsavel_id() = any(parts)
      or (cid is null and public.tem_permissao('agenda'))
      or public.pode_ver_cliente(cid)
    ))
$$;
grant execute on function public.pode_ver_compromisso(uuid, uuid[], uuid) to authenticated;

alter table public.compromissos enable row level security;
create policy "compromissos_equipe_select" on public.compromissos for select
  using (public.pode_ver_compromisso(client_id, participantes, criado_por));
create policy "compromissos_equipe_insert" on public.compromissos for insert
  with check (public.current_user_role() in ('admin', 'advogado') and (client_id is null or public.pode_ver_cliente(client_id)));
create policy "compromissos_equipe_update" on public.compromissos for update
  using (public.pode_ver_compromisso(client_id, participantes, criado_por))
  with check (public.current_user_role() in ('admin', 'advogado') and (client_id is null or public.pode_ver_cliente(client_id)));
create policy "compromissos_equipe_delete" on public.compromissos for delete
  using (public.pode_ver_compromisso(client_id, participantes, criado_por));

-- ───────────── fila do Zap: de onde veio cada envio ─────────────
alter table public.wa_jobs add column if not exists origem_ref text; -- ex.: compromisso:<id>:24h · rotina:<resp>:<dia>
create index if not exists wa_jobs_origem_idx on public.wa_jobs (origem_ref);

-- rotina diária já enviada (não manda duas vezes no mesmo dia)
create table if not exists public.rotina_envios (
  responsavel_id uuid not null references public.responsaveis (id) on delete cascade,
  dia date not null,
  job_id uuid,
  created_at timestamptz not null default now(),
  primary key (responsavel_id, dia)
);
alter table public.rotina_envios enable row level security;
create policy "rotina_envios_admin_select" on public.rotina_envios for select
  using (public.current_user_role() = 'admin');

-- vincula agora as conversas que já existem (nada a vincular até preencher as fichas)
update public.wa_chats w set client_id = public.cliente_do_chat(w.chat_jid, w.nome, w.is_group), vinculo_auto = true
  where w.client_id is null and public.cliente_do_chat(w.chat_jid, w.nome, w.is_group) is not null;

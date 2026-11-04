-- 0066 (04/11/2026):
--  1. Novidades do portal (estilo "What's new" do Chrome): a cada mudança visível
--     sai uma novidade com prints e como usar. Abre sozinha 1 vez para cada
--     pessoa da equipe; depois fica em Caixa de entrada → Alertas → Novidades.
--  2. Mensagens agendadas no WhatsApp (pelo Assistente ou pela conversa):
--     uma vez, todo dia, toda semana ou todo mês, para a conversa escolhida.
--  3. Base de conhecimento do escritório (jurídico, operacional e comercial) que
--     o Assistente consulta quando precisa. Só a equipe lê; só o admin escreve.

-- ───────────── 1. novidades ─────────────
create table if not exists public.novidades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  resumo text,
  itens jsonb not null default '[]'::jsonb,  -- [{titulo, texto, como_usar: [..], imagem: url, link}]
  publicada_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.novidades_vistas (
  novidade_id uuid not null references public.novidades (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  vista_em timestamptz not null default now(),
  primary key (novidade_id, profile_id)
);
alter table public.novidades enable row level security;
alter table public.novidades_vistas enable row level security;
drop policy if exists "novidades_equipe_select" on public.novidades;
create policy "novidades_equipe_select" on public.novidades for select
  using (public.current_user_role() in ('admin', 'advogado'));
drop policy if exists "novidades_vistas_proprias" on public.novidades_vistas;
create policy "novidades_vistas_proprias" on public.novidades_vistas for all
  using (profile_id = (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id = (select id from public.profiles where user_id = auth.uid()));

-- ───────────── 2. mensagens agendadas ─────────────
create table if not exists public.zap_agendamentos (
  id uuid primary key default gen_random_uuid(),
  para text not null,                -- JID da conversa/grupo ou telefone
  rotulo text not null,              -- nome da conversa (para mostrar)
  texto text not null check (length(trim(texto)) > 0),
  -- {"tipo":"unica"} | {"tipo":"diaria"} | {"tipo":"semanal","dias":[1,3]} | {"tipo":"mensal","dia":5}
  recorrencia jsonb not null default '{"tipo":"unica"}'::jsonb,
  hora time not null,                -- horário da Bahia
  proxima_em timestamptz,            -- null = acabou (única já enviada) ou pausada
  ultima_em timestamptz,
  envios int not null default 0,
  ate date,                          -- repetir até esta data (opcional)
  ativo boolean not null default true,
  criado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists zap_agendamentos_proxima_idx on public.zap_agendamentos (proxima_em) where ativo;
alter table public.zap_agendamentos enable row level security;
drop policy if exists "zap_agendamentos_equipe" on public.zap_agendamentos;
create policy "zap_agendamentos_equipe" on public.zap_agendamentos for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

-- ───────────── 3. base de conhecimento ─────────────
create table if not exists public.base_conhecimento (
  id uuid primary key default gen_random_uuid(),
  area text not null,                -- ex.: "Escritório", "Marcas e PI", "Trabalhista"
  titulo text not null,
  conteudo text not null,
  palavras text[] not null default '{}',
  ordem int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.base_conhecimento enable row level security;
drop policy if exists "base_conhecimento_equipe_select" on public.base_conhecimento;
create policy "base_conhecimento_equipe_select" on public.base_conhecimento for select
  using (public.current_user_role() in ('admin', 'advogado'));
drop policy if exists "base_conhecimento_admin_write" on public.base_conhecimento;
create policy "base_conhecimento_admin_write" on public.base_conhecimento for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

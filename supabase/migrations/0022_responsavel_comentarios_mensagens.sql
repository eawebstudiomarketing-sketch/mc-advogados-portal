-- Responsável de fora da empresa + comentários nas atividades + mensagens
-- internas da equipe + avisos (out/2026). Aditiva.
--
-- Decisões do usuário (15/10/2026):
--  - qualquer pessoa da equipe pode ser responsável por uma atividade, mesmo sem
--    ser designada ao cliente; ela passa a ver SÓ aquela atividade (não a ficha);
--  - comentários são só da equipe (o cliente nunca vê);
--  - comunicação interna = conversas 1:1 + canal geral "Escritório".

-- 1) RESPONSÁVEL VÊ A PRÓPRIA ATIVIDADE (antes dependia da exceção
--    "atividades_como_responsavel", desligada por padrão)
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
        or (resp is not null and resp = public.meu_responsavel_id())
      )
    )
$$;

-- atividade por id (usado pelas regras de comentários)
create or replace function public.pode_ver_atividade_id(aid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.activities a
    where a.id = aid and public.pode_ver_atividade(a.client_id, a.responsible_id, a.responsavel_id)
  )
$$;
grant execute on function public.pode_ver_atividade_id(uuid) to authenticated;

-- 2) DEMANDAS: responsável escolhido já no rascunho (vira o da atividade)
alter table public.onboarding_demand_drafts
  add column if not exists responsavel_id uuid references public.responsaveis (id) on delete set null;

-- 3) COMENTÁRIOS NAS ATIVIDADES (só equipe)
create table if not exists public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  autor_id uuid not null references public.profiles (id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  mencoes uuid[] not null default '{}',    -- profiles marcados com @
  editado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists activity_comments_activity_idx on public.activity_comments (activity_id, created_at);

alter table public.activity_comments enable row level security;
create policy "activity_comments_select" on public.activity_comments for select
  using (public.pode_ver_atividade_id(activity_id));
create policy "activity_comments_insert" on public.activity_comments for insert
  with check (autor_id = public.current_profile_id() and public.pode_ver_atividade_id(activity_id));
create policy "activity_comments_update" on public.activity_comments for update
  using (autor_id = public.current_profile_id())
  with check (autor_id = public.current_profile_id());
create policy "activity_comments_delete" on public.activity_comments for delete
  using (autor_id = public.current_profile_id() or public.current_user_role() = 'admin');

-- 4) MENSAGENS INTERNAS. conversa = 'geral' (todo mundo da equipe) ou
--    'dm:<profileA>:<profileB>' com os dois ids em ordem alfabética.
create or replace function public.participa_conversa(conversa text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() in ('admin', 'advogado')
    and (
      conversa = 'geral'
      or (
        conversa like 'dm:%'
        and public.current_profile_id()::text in (split_part(conversa, ':', 2), split_part(conversa, ':', 3))
      )
    )
$$;
grant execute on function public.participa_conversa(text) to authenticated;

create table if not exists public.chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa text not null check (conversa = 'geral' or conversa ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  autor_id uuid not null references public.profiles (id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists chat_mensagens_conversa_idx on public.chat_mensagens (conversa, created_at desc);

alter table public.chat_mensagens enable row level security;
create policy "chat_mensagens_select" on public.chat_mensagens for select
  using (public.participa_conversa(conversa));
create policy "chat_mensagens_insert" on public.chat_mensagens for insert
  with check (autor_id = public.current_profile_id() and public.participa_conversa(conversa));
create policy "chat_mensagens_delete" on public.chat_mensagens for delete
  using (autor_id = public.current_profile_id());

-- até onde cada pessoa já leu cada conversa (contador de não lidas)
create table if not exists public.chat_leituras (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  conversa text not null,
  lido_em timestamptz not null default now(),
  primary key (profile_id, conversa)
);
alter table public.chat_leituras enable row level security;
create policy "chat_leituras_proprias" on public.chat_leituras for all
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- 5) AVISOS (sininho de cada pessoa): marcaram você num comentário, comentaram
--    numa atividade sua, você virou responsável por uma atividade.
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null,                      -- mencao | comentario | responsavel
  titulo text not null,
  corpo text,
  url text,
  lido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists avisos_profile_idx on public.avisos (profile_id, created_at desc);

alter table public.avisos enable row level security;
create policy "avisos_proprios_select" on public.avisos for select
  using (profile_id = public.current_profile_id());
create policy "avisos_proprios_update" on public.avisos for update
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());
create policy "avisos_proprios_delete" on public.avisos for delete
  using (profile_id = public.current_profile_id());
-- (quem cria avisos é o servidor com a chave de serviço, ou o gatilho abaixo)

-- virou responsável por uma atividade (por qualquer caminho: formulário, mini
-- tela, demanda aprovada, assistente) → aviso para a pessoa, se tiver login e
-- não for ela mesma quem fez a mudança
create or replace function public.avisa_novo_responsavel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid;
  cliente text;
begin
  if new.responsavel_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.responsavel_id is not distinct from old.responsavel_id then return new; end if;
  select profile_id into alvo from public.responsaveis where id = new.responsavel_id;
  if alvo is null or alvo = public.current_profile_id() then return new; end if;
  select name into cliente from public.clients where id = new.client_id;
  insert into public.avisos (profile_id, tipo, titulo, corpo, url)
  values (alvo, 'responsavel', 'Você é o responsável por uma atividade',
          new.title || coalesce(' — ' || cliente, ''), '/admin/activities/' || new.id);
  return new;
end;
$$;

drop trigger if exists activities_avisa_responsavel on public.activities;
create trigger activities_avisa_responsavel
  after insert or update of responsavel_id on public.activities
  for each row execute function public.avisa_novo_responsavel();

-- 6) Tempo real
alter publication supabase_realtime add table public.activity_comments;
alter publication supabase_realtime add table public.chat_mensagens;
alter publication supabase_realtime add table public.avisos;

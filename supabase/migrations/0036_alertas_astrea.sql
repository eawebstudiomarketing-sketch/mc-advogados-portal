-- Alertas no padrão do Astrea (22/10/2026): abas Publicações e Andamentos com
-- as mesmas ações (tratar, descartar alerta, concluir, etiqueta, importante,
-- comentário, histórico manual, sugestão incorreta). Aditiva.

-- 1) Andamento: tratamento feito nele (o Astrea mostra "Não tratado"/"Tratado"
--    em cada um até concluir o alerta).
alter table public.andamentos
  add column if not exists acao text,                 -- ex.: "Tarefa adicionada"
  add column if not exists acao_em timestamptz,
  add column if not exists acao_por uuid references public.profiles (id) on delete set null;

-- 2) Publicação: descartar só o alerta (a publicação continua na lista),
--    etiquetas e "classificar sugestão como incorreta".
alter table public.publicacoes
  add column if not exists alerta_descartado_em timestamptz,
  add column if not exists etiquetas jsonb not null default '[]'::jsonb,
  add column if not exists sugestao_incorreta boolean not null default false;

-- 3) Comentários nos andamentos e nas publicações.
create table if not exists public.alerta_comentarios (
  id uuid primary key default gen_random_uuid(),
  andamento_id uuid references public.andamentos (id) on delete cascade,
  publicacao_id uuid references public.publicacoes (id) on delete cascade,
  autor_id uuid references public.profiles (id) on delete set null,
  autor_nome text,
  texto text not null,
  created_at timestamptz not null default now(),
  check (andamento_id is not null or publicacao_id is not null)
);
create index if not exists alerta_comentarios_andamento_idx on public.alerta_comentarios (andamento_id);
create index if not exists alerta_comentarios_publicacao_idx on public.alerta_comentarios (publicacao_id);

alter table public.alerta_comentarios enable row level security;
drop policy if exists "alerta_comentarios_select" on public.alerta_comentarios;
create policy "alerta_comentarios_select" on public.alerta_comentarios for select using (
  public.current_user_role() in ('admin', 'advogado')
  and (
    (andamento_id is not null and exists (select 1 from public.andamentos a where a.id = andamento_id and public.pode_ver_processo(a.process_id)))
    or (publicacao_id is not null and public.tem_permissao('publicacoes'))
  )
);
drop policy if exists "alerta_comentarios_insert" on public.alerta_comentarios;
create policy "alerta_comentarios_insert" on public.alerta_comentarios for insert with check (
  autor_id = public.current_profile_id()
  and (
    (andamento_id is not null and exists (select 1 from public.andamentos a where a.id = andamento_id and public.pode_ver_processo(a.process_id)))
    or (publicacao_id is not null and public.tem_permissao('publicacoes'))
  )
);

-- 4) Correção da cópia inicial (21/10): o que veio do Astrea ficou com a hora
--    da importação. Histórico volta para a data do próprio registro; os alertas
--    pendentes recebem a hora de chegada do Astrea pelo robô logo depois.
update public.andamentos set created_at = data
  where fonte = 'astrea' and situacao = 'historico' and created_at > data;
update public.publicacoes set created_at = (data_disponibilizacao::timestamp + time '08:00') at time zone 'America/Bahia'
  where fonte = 'astrea' and created_at >= '2026-10-21' and data_disponibilizacao < '2026-10-21';

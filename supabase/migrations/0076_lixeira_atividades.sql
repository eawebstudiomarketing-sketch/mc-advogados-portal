-- 0076 (12/11/2026): Lixeira de atividades + correção da Lixeira de documentos.
--
-- 1) documents_trash.client_id aceitava só documento de cliente. Desde a 0073
--    existe anexo de atividade sem cliente (client_id nulo): ao excluir essa
--    atividade, o gatilho que guarda o anexo na lixeira falhava e a exclusão
--    inteira era recusada ("documents_trash.client_id not-null").
alter table public.documents_trash alter column client_id drop not null;

-- 2) Atividade excluída fica 30 dias restaurável: guarda a atividade, os
--    comentários e tudo o que estava ligado a ela (o portal lê e grava só
--    pelo servidor, com a chave de serviço; sem acesso direto do navegador).
create table if not exists public.activities_trash (
  id uuid primary key,            -- mesmo id da atividade
  title text not null,
  client_id uuid,
  dados jsonb not null,           -- { activity, filhos: {tabela: linhas[]}, ligacoes: {tabela: ids[]}, documentos: ids[] }
  deleted_at timestamptz not null default now(),
  deleted_by uuid references public.profiles (id) on delete set null
);
create index if not exists activities_trash_deleted_at_idx on public.activities_trash (deleted_at);
alter table public.activities_trash enable row level security;

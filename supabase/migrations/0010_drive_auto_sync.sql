-- Sincronização com o Drive simplificada (2026-09-26):
--  - clients.drive_last_sync_at: quando cada cliente foi sincronizado pela
--    última vez (à mão ou pela rodada automática). A rodada automática começa
--    pelos clientes sincronizados há mais tempo.
--  - drive_sync_runs: histórico das rodadas AUTOMÁTICAS da madrugada (o que
--    entrou, o que saiu, o que falhou). RLS ligada SEM policies: só o servidor
--    (service_role) lê e grava; a tela lê pelo servidor, só pra admin.
-- Aditiva.

alter table public.clients add column drive_last_sync_at timestamptz;

create table public.drive_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  clients_synced integer not null default 0,
  clients_pending integer not null default 0,
  imported integer not null default 0,
  exported integer not null default 0,
  failed integer not null default 0,
  note text
);
alter table public.drive_sync_runs enable row level security;

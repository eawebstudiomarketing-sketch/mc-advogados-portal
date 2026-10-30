-- 0060 (30/10/2026): etiquetas coloridas também nos processos (item 19 da auditoria).
-- Mesmas etiquetas das atividades (tabela etiquetas); o processo guarda os ids.
alter table public.processes add column if not exists etiquetas uuid[] not null default '{}';
create index if not exists processes_etiquetas_idx on public.processes using gin (etiquetas);

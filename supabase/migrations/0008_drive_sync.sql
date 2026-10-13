-- Sincronização com o Google Drive (importar / exportar / sincronizar).
-- Aditiva: só colunas novas, nada existente é alterado.
--
-- documents.legacy_file_path: ao EXPORTAR um documento que estava no Supabase
--   Storage para o Drive, o portal passa a apontar pro Drive (drive_file_id)
--   mas guarda aqui o caminho antigo, e a cópia no Storage é MANTIDA como
--   segurança (decisão do usuário, 2026-09-25).
-- monthly_reports.drive_file_id / onboardings.drive_file_id: PDF gerado que já
--   foi copiado pra pasta do cliente no Drive (o PDF original continua no
--   Storage; o Drive recebe uma cópia).

alter table public.documents add column legacy_file_path text;
alter table public.monthly_reports add column drive_file_id text;
alter table public.onboardings add column drive_file_id text;

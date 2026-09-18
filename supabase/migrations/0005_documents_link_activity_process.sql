-- Permite anexar um documento diretamente a uma atividade ou a um processo
-- específico (além do vínculo já existente com o cliente). client_id
-- continua obrigatório e é quem manda nas políticas de RLS já existentes —
-- estas duas colunas são só marcação adicional para filtrar "documentos
-- desta atividade/processo" nas telas de detalhe, sem tocar em segurança.

alter table public.documents
  add column activity_id uuid references public.activities (id) on delete cascade,
  add column process_id uuid references public.processes (id) on delete cascade;

create index documents_activity_id_idx on public.documents (activity_id);
create index documents_process_id_idx on public.documents (process_id);

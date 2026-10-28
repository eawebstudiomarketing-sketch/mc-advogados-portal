-- Atas viram "Reuniões": a gravação é transcrita e entregue (transcrição fiel + resumo)
-- e a ata é gerada depois, sob demanda. Dois status novos:
--   transcrita = reunião entregue, ainda sem ata (ou ata ainda não gerada)
--   gerando    = a IA está escrevendo a ata a partir da transcrição
-- Aditiva: as atas existentes não mudam.
alter table public.atas drop constraint if exists atas_status_check;
alter table public.atas add constraint atas_status_check
  check (status in ('gravando', 'processando', 'transcrita', 'gerando', 'rascunho', 'erro', 'aguardando', 'aprovada', 'assinada'));

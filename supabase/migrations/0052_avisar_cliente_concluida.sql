-- 0052 (29/10/2026): botão "avisar o cliente no Zap" que a atividade foi concluída.
--  * activities.cliente_avisado_em/por: quando e quem avisou (selo na atividade, evita aviso em dobro);
--  * escritorio_config.aviso_concluida: texto-modelo editável, que o Maurício salva uma vez e fica fixo.

alter table public.activities add column if not exists cliente_avisado_em timestamptz;
alter table public.activities add column if not exists cliente_avisado_por uuid references public.profiles (id) on delete set null;

alter table public.escritorio_config add column if not exists aviso_concluida text not null
  default E'Olá! Informamos que a demanda "{titulo}" foi concluída. Qualquer dúvida, estamos à disposição.\nMC Advogados';

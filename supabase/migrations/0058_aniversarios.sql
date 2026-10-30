-- 0058 (30/10/2026): aniversários dos clientes (aba Contatos → Aniversários).
--  * escritorio_config.aniversario_ativo: parabéns automático no WhatsApp às 09h (começa DESLIGADO);
--  * escritorio_config.aniversario_mensagem: texto-modelo editável ({cliente} = primeiro nome).
-- A data é clients.nascimento (já existe). Não manda duas vezes no mesmo ano:
-- a fila (wa_jobs.origem_ref = aniversario:<cliente>:<ano>) é conferida antes.

alter table public.escritorio_config add column if not exists aniversario_ativo boolean not null default false;
alter table public.escritorio_config add column if not exists aniversario_mensagem text not null
  default E'Olá, {cliente}! Hoje é seu dia e toda a equipe da MC Advogados deseja um feliz aniversário, com muita saúde e conquistas. Conte sempre com a gente!';

-- Ficha de Handoff (Comercial → Jurídico) no lugar da triagem em texto livre
-- (out/2026). As respostas ficam em JSON (chave = id do campo, ver
-- src/lib/handoff-schema.ts). A coluna `triagem` antiga continua: o texto de
-- quem já tinha triagem aparece como "Anotações anteriores" e a IA segue lendo.
-- Aditiva.
alter table public.clients
  add column if not exists handoff jsonb,
  add column if not exists handoff_updated_at timestamptz;

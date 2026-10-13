-- Triagem + onboarding gerado pelo Gemini + ATAs + demandas por fonte (out/2026).
-- Tudo aditivo: nenhum dado existente muda.

-- 1) Triagem: texto livre com as informações gerais do cliente, lido pela IA
--    nas gerações seguintes (onboarding e demandas).
alter table public.clients
  add column if not exists triagem text,
  add column if not exists triagem_updated_at timestamptz;

-- 2) Onboarding personalizado: as etapas/perguntas usadas ficam salvas no
--    próprio onboarding. Nulo = onboarding no padrão fixo (os antigos).
alter table public.onboardings
  add column if not exists questions jsonb;

-- 3) ATAs: nova categoria de documento + data da reunião.
alter type public.document_category add value if not exists 'ata';
alter table public.documents
  add column if not exists meeting_date date;

-- ATAs são internas: o cliente continua vendo os próprios documentos, menos
-- as ATAs. (Comparação em texto porque o valor novo do enum não pode ser
-- usado na mesma transação em que foi criado.) Os arquivos das ATAs vão para
-- internal/{client_id}/atas/, fora da pasta {client_id}/ que o cliente lê
-- no Storage.
drop policy if exists "documents_client_select" on public.documents;
create policy "documents_client_select" on public.documents for select
  using (client_id = public.current_user_client_id() and category::text <> 'ata');

-- 4) Demandas geradas a partir de fontes escolhidas (triagem, onboarding,
--    ATAs, documento avulso). Rascunho não depende mais de um onboarding.
alter table public.onboarding_demand_drafts
  alter column onboarding_id drop not null,
  add column if not exists sources jsonb not null default '[]'::jsonb,
  add column if not exists instructions text;

create index if not exists onboarding_demand_drafts_client_id_idx
  on public.onboarding_demand_drafts (client_id);

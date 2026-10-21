-- Leitura do WhatsApp para a Distribuição escolhida por conversa (21/10/2026).
-- null = automático (cliente vinculado ou grupo "Assessoria Jurídica");
-- true = sempre ler (mesmo sem cliente); false = nunca ler.
alter table public.wa_chats add column if not exists ler_demandas boolean;

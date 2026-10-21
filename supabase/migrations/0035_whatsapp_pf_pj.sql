-- 0035 (out/2026): filtro PF/PJ no WhatsApp do portal (pedido de 21/10).
-- Marcação manual de cada conversa; null = automático (cliente vinculado,
-- grupo de Assessoria Jurídica ou nome de empresa = PJ; contato = PF).
alter table public.wa_chats add column if not exists tipo_pessoa text;
alter table public.wa_chats drop constraint if exists wa_chats_tipo_pessoa_check;
alter table public.wa_chats add constraint wa_chats_tipo_pessoa_check check (tipo_pessoa in ('PF', 'PJ'));

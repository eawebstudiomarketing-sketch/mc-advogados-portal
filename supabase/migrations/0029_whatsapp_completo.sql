-- 0029 (out/2026): WhatsApp completo no portal.
--  * mensagens: resposta (citação), reações, encaminhada;
--  * conversas: fixada e silenciada (arquivada já existia);
--  * busca rápida de mensagens dentro da conversa.

alter table public.wa_messages add column if not exists resposta_a text;        -- wa_id da mensagem citada
alter table public.wa_messages add column if not exists resposta_texto text;    -- trecho da citada (pra mostrar sem buscar)
alter table public.wa_messages add column if not exists resposta_de text;       -- jid de quem escreveu a citada
alter table public.wa_messages add column if not exists reacoes jsonb not null default '{}'::jsonb; -- {jid: emoji}
alter table public.wa_messages add column if not exists encaminhada boolean not null default false;

alter table public.wa_chats add column if not exists fixado boolean not null default false;
alter table public.wa_chats add column if not exists silenciado boolean not null default false;

create index if not exists wa_messages_chat_ts_idx on public.wa_messages (chat_jid, wa_timestamp desc);
create index if not exists wa_chats_ordem_idx on public.wa_chats (fixado desc, ultima_msg_em desc nulls last);

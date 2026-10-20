-- 0031 (out/2026): nome de perfil de quem mandou a mensagem (pushName),
-- para mostrar "~Fulano" no grupo quando o número não está na agenda.
alter table public.wa_messages add column if not exists sender_nome text;

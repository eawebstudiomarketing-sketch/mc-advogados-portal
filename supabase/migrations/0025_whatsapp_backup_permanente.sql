-- 0025 — WhatsApp como backup permanente.
-- 1) Mensagem apagada/editada no celular continua no portal (marcada).
-- 2) Mídia do histórico baixada aos poucos pelo Agente (fila).
-- 3) Foto de perfil das conversas e lista de contatos da agenda.
-- 4) Ninguém apaga mensagem do WhatsApp do portal (nem a service_role).

-- 1) apagadas / editadas
alter table public.wa_messages add column if not exists apagada_em timestamptz;      -- apagada "para todos" no celular
alter table public.wa_messages add column if not exists editada_em timestamptz;
alter table public.wa_messages add column if not exists texto_original text;         -- texto antes da 1ª edição

-- 2) fila de mídia: raw guarda o necessário pra baixar depois
alter table public.wa_messages add column if not exists media_erro text;
alter table public.wa_messages add column if not exists media_tentativas int not null default 0;
create index if not exists wa_messages_midia_pendente_idx on public.wa_messages (wa_timestamp desc)
  where media_path is null and raw is not null and media_erro is null;

-- 3) fotos e contatos
alter table public.wa_chats add column if not exists foto_atualizada_em timestamptz;

create table if not exists public.wa_contatos (
  jid text primary key,                    -- 5571999999999@s.whatsapp.net
  nome text,                               -- nome salvo na agenda do celular
  nome_perfil text,                        -- nome que a pessoa pôs no WhatsApp
  updated_at timestamptz not null default now()
);
alter table public.wa_contatos enable row level security;
drop policy if exists "wa_contatos_admin_select" on public.wa_contatos;
create policy "wa_contatos_admin_select" on public.wa_contatos for select
  using (public.current_user_role() = 'admin');

-- última mensagem/prévia de cada conversa a partir das mensagens guardadas
-- (o histórico chega em pedaços e fora de ordem)
create or replace function public.wa_atualizar_ultima(jids text[])
returns void language sql security definer set search_path = public as $$
  update public.wa_chats c set
    ultima_msg_em = m.wa_timestamp,
    ultima_msg_preview = left(coalesce(
      nullif(m.texto, ''),
      case m.tipo when 'imagem' then '📷 Foto' when 'audio' then '🎤 Áudio' when 'video' then '🎥 Vídeo'
                  when 'documento' then '📄 Documento' when 'figurinha' then 'Figurinha' else '' end), 120)
  from (
    select distinct on (chat_jid) chat_jid, wa_timestamp, texto, tipo
    from public.wa_messages where chat_jid = any(jids)
    order by chat_jid, wa_timestamp desc
  ) m
  where c.chat_jid = m.chat_jid
    and (c.ultima_msg_em is null or c.ultima_msg_em <= m.wa_timestamp);
$$;
revoke all on function public.wa_atualizar_ultima(text[]) from public, anon, authenticated;

-- 4) backup permanente: bloqueia apagar mensagem (apagar conversa com
-- mensagens também falha, por causa do cascade)
create or replace function public.wa_messages_nao_apaga()
returns trigger language plpgsql as $$
begin
  raise exception 'Mensagens do WhatsApp são backup permanente e não podem ser apagadas.';
end;
$$;
drop trigger if exists wa_messages_nao_apaga on public.wa_messages;
create trigger wa_messages_nao_apaga before delete on public.wa_messages
  for each row execute function public.wa_messages_nao_apaga();

-- WhatsApp + CRM (out/2026): o portal passa a espelhar o WhatsApp do escritório
-- e a comandar envios pela IA. A conexão fica num "Agente MC" (Baileys) que roda
-- na máquina do operador, liga/desliga sob demanda e conversa com o banco pela
-- service_role. O portal mostra o espelho ao vivo (Supabase Realtime) e enfileira
-- as ordens da IA em wa_jobs. Aditiva. Acesso: admin e advogado (refinar depois).

-- 1) AGENTE: um registro por máquina. O Agente dá "heartbeat" a cada poucos
--    segundos; o portal mostra 🟢/🔴 comparando last_heartbeat com agora.
create table if not exists public.wa_agent (
  device_id text primary key,              -- id fixo da máquina (ex.: "pc-joao")
  label text,                              -- nome amigável ("Notebook João")
  online boolean not null default false,
  numero text,                             -- número conectado (jid do dono)
  qr text,                                 -- QR atual quando precisa parear (base64/string)
  estado text not null default 'desligado' -- desligado | aguardando_qr | conectando | conectado
    check (estado in ('desligado', 'aguardando_qr', 'conectando', 'conectado')),
  ultimo_erro text,
  versao text,
  last_heartbeat timestamptz,
  updated_at timestamptz not null default now()
);

-- 2) CHATS: uma linha por conversa do WhatsApp (jid). Liga opcionalmente a um
--    cliente já cadastrado e/ou a um lead de captação.
create table if not exists public.wa_chats (
  chat_jid text primary key,               -- ex.: 5571999999999@s.whatsapp.net
  nome text,                               -- nome/pushname ou nome do grupo
  is_group boolean not null default false,
  foto_url text,
  client_id uuid references public.clients (id) on delete set null,
  lead_id uuid,                            -- fk adicionada após criar leads (ver abaixo)
  responsavel uuid references public.profiles (id) on delete set null,
  nao_lidas int not null default 0,
  arquivado boolean not null default false,
  ultima_msg_em timestamptz,
  ultima_msg_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wa_chats_ultima_idx on public.wa_chats (ultima_msg_em desc nulls last);
create index if not exists wa_chats_client_idx on public.wa_chats (client_id);

-- 3) MENSAGENS. wa_id = id da mensagem no WhatsApp (evita duplicar). quem:
--    'cliente' = recebida; 'humano' = enviada por uma pessoa; 'ia' = enviada
--    pela IA via Agente.
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  chat_jid text not null references public.wa_chats (chat_jid) on delete cascade,
  wa_id text unique,
  from_me boolean not null default false,
  sender_jid text,                         -- quem mandou (útil em grupo)
  quem text not null default 'cliente' check (quem in ('cliente', 'humano', 'ia')),
  tipo text not null default 'texto'       -- texto | imagem | audio | video | documento | figurinha | outro
    check (tipo in ('texto', 'imagem', 'audio', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'outro')),
  texto text,
  media_path text,                         -- caminho no bucket "whatsapp" (Storage)
  media_mime text,
  media_nome text,
  status text not null default 'recebida'  -- recebida | enviando | enviada | entregue | lida | erro
    check (status in ('recebida', 'enviando', 'enviada', 'entregue', 'lida', 'erro')),
  erro text,
  job_id uuid,                             -- se saiu de uma ordem da IA (ver wa_jobs)
  raw jsonb,
  wa_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_chat_idx on public.wa_messages (chat_jid, wa_timestamp desc);
create index if not exists wa_messages_ts_idx on public.wa_messages (wa_timestamp desc);

-- 4) FILA DE ORDENS: a IA (ou um atalho) cria um job; o Agente pega, executa e
--    devolve resultado. É a ponte nuvem → máquina. Nada dispara sem um job aqui.
create table if not exists public.wa_jobs (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                      -- enviar_mensagem | enviar_relatorio | iniciar_triagem | enviar_lote | marcar_lido ...
  payload jsonb not null default '{}',
  status text not null default 'pendente'  -- pendente | executando | concluido | erro | cancelado
    check (status in ('pendente', 'executando', 'concluido', 'erro', 'cancelado')),
  resultado jsonb,
  erro text,
  chat_jid text,                           -- conveniência: chat alvo quando houver
  criado_por uuid references public.profiles (id) on delete set null,
  tentativas int not null default 0,
  agendado_para timestamptz,               -- null = assim que possível
  iniciado_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wa_jobs_fila_idx on public.wa_jobs (status, agendado_para nulls first, created_at);

-- 5) LEADS (captação). Entra um desconhecido no zap → vira lead → a IA qualifica.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text,
  telefone text,
  chat_jid text references public.wa_chats (chat_jid) on delete set null,
  origem text not null default 'whatsapp', -- whatsapp | indicacao | site | instagram | outro
  status text not null default 'novo'      -- novo | qualificando | quente | cliente | perdido
    check (status in ('novo', 'qualificando', 'quente', 'cliente', 'perdido')),
  area text,                               -- área jurídica detectada pela IA
  resumo text,                             -- resumo do caso feito pela IA
  score int,                               -- 0-100, quão quente a IA achou
  responsavel uuid references public.profiles (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null, -- preenchido quando vira cliente
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_chat_idx on public.leads (chat_jid);

-- fk de wa_chats.lead_id agora que leads existe
alter table public.wa_chats
  add constraint wa_chats_lead_fk foreign key (lead_id) references public.leads (id) on delete set null;

-- 6) STORAGE: bucket privado pra mídia do WhatsApp (áudio, imagem, PDF).
insert into storage.buckets (id, name, public)
values ('whatsapp', 'whatsapp', false)
on conflict (id) do nothing;

-- 7) ACESSO (RLS). Agente usa service_role e ignora tudo isto. No portal,
--    admin e advogado leem/escrevem; delete fica só com admin.
alter table public.wa_agent enable row level security;
alter table public.wa_chats enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_jobs enable row level security;
alter table public.leads enable row level security;

create policy "wa_agent_equipe_select" on public.wa_agent for select
  using (public.current_user_role() in ('admin', 'advogado'));

create policy "wa_chats_equipe_rw" on public.wa_chats for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

create policy "wa_messages_equipe_rw" on public.wa_messages for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

create policy "wa_jobs_equipe_rw" on public.wa_jobs for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

create policy "leads_equipe_rw" on public.leads for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

-- mídia do WhatsApp: equipe logada vê; quem grava de fato é o Agente (service_role)
create policy "whatsapp_media_equipe_select" on storage.objects for select
  using (bucket_id = 'whatsapp' and public.current_user_role() in ('admin', 'advogado'));

-- 8) Realtime: o espelho ao vivo precisa que estas tabelas publiquem mudanças.
alter publication supabase_realtime add table public.wa_messages;
alter publication supabase_realtime add table public.wa_chats;
alter publication supabase_realtime add table public.wa_agent;
alter publication supabase_realtime add table public.wa_jobs;

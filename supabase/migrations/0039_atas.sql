-- Gerador de atas (22/10/2026): grava a reunião (ou recebe o áudio), a IA
-- monta a ata no modelo do escritório, o advogado revisa e aprova, e o portal
-- colhe as assinaturas (link pessoal + código de 6 dígitos por WhatsApp ou
-- e-mail). Quem aprova assina pelo escritório. A gravação e a transcrição
-- ficam em `transcricoes` (aba Transcrição); o PDF assinado vira documento
-- "ata" do cliente (interno: o cliente não vê no portal dele).

create table if not exists public.atas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  transcricao_id uuid references public.transcricoes (id) on delete set null,
  tipo text not null default 'reuniao_cliente' check (tipo in ('onboarding', 'reuniao_cliente', 'interna')),
  titulo text not null default 'Ata de reunião',
  data_reuniao timestamptz not null default now(),
  local text,
  pauta text,
  -- [{ nome, papel: escritorio|cliente|outro, profile_id?, telefone?, email?, cargo? }]
  participantes jsonb not null default '[]'::jsonb,
  -- momentos marcados durante a gravação: [{ seg, tipo: importante|decisao }]
  marcacoes jsonb not null default '[]'::jsonb,
  status text not null default 'gravando' check (status in ('gravando', 'processando', 'rascunho', 'erro', 'aguardando', 'aprovada', 'assinada')),
  erro text,
  texto text,
  -- conferência automática da IA: [{ tipo: nao_dito|faltou, texto, motivo, minuto? }]
  alertas jsonb not null default '[]'::jsonb,
  versao int not null default 1,
  aprovada_por uuid references public.profiles (id) on delete set null,
  aprovada_em timestamptz,
  pdf_cliente_path text,
  pdf_hash text,
  pdf_final_path text,
  document_id uuid references public.documents (id) on delete set null,
  correcao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists atas_dono_idx on public.atas (profile_id, created_at desc);
create index if not exists atas_cliente_idx on public.atas (client_id, created_at desc);

alter table public.atas enable row level security;
drop policy if exists "atas_ver" on public.atas;
create policy "atas_ver" on public.atas for select
  using (profile_id = public.current_profile_id() or public.current_user_role() = 'admin');
drop policy if exists "atas_criar" on public.atas;
create policy "atas_criar" on public.atas for insert
  with check (profile_id = public.current_profile_id() and public.current_user_role() in ('admin', 'advogado'));
drop policy if exists "atas_editar" on public.atas;
create policy "atas_editar" on public.atas for update
  using (profile_id = public.current_profile_id() or public.current_user_role() = 'admin');
drop policy if exists "atas_apagar" on public.atas;
create policy "atas_apagar" on public.atas for delete
  using (profile_id = public.current_profile_id() or public.current_user_role() = 'admin');

-- Uma linha por pessoa e por versão da ata. O link leva o token; no banco só
-- fica o hash dele (e do código). A página pública de assinatura usa a chave
-- de serviço, então ninguém de fora lê esta tabela direto.
create table if not exists public.ata_assinaturas (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid not null references public.atas (id) on delete cascade,
  versao int not null,
  nome text not null,
  papel text not null default 'cliente' check (papel in ('escritorio', 'cliente', 'outro')),
  telefone text,
  email text,
  token_hash text unique,
  -- o link é derivado do id + geracao (dá para reenviar o mesmo link nos lembretes; "Reenviar" sobe a geração e o antigo para de valer)
  geracao int not null default 0,
  status text not null default 'pendente' check (status in ('pendente', 'assinada', 'correcao', 'cancelada')),
  codigo_hash text,
  codigo_expira timestamptz,
  codigo_destino text,
  tentativas int not null default 0,
  enviado_em timestamptz,
  lembretes int not null default 0,
  ultimo_lembrete timestamptz,
  assinado_em timestamptz,
  assinado_via text,
  ip text,
  user_agent text,
  correcao text,
  expira_em timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);
create index if not exists ata_assinaturas_ata_idx on public.ata_assinaturas (ata_id, versao);

alter table public.ata_assinaturas enable row level security;
drop policy if exists "ata_assinaturas_ver" on public.ata_assinaturas;
create policy "ata_assinaturas_ver" on public.ata_assinaturas for select
  using (exists (select 1 from public.atas a where a.id = ata_id and (a.profile_id = public.current_profile_id() or public.current_user_role() = 'admin')));

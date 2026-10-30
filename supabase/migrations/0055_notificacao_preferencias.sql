-- 0055 (30/10/2026): preferências de notificação de cada pessoa da equipe.
-- Cada pessoa liga ou desliga, por tipo de aviso e por canal (WhatsApp / e-mail), o que o sistema envia
-- a ela, e escolhe o formato da mensagem (completa, resumida ou só o título). Sem linha = ligado e completo.
-- Só o servidor (service role) lê e grava; a pessoa mexe pela tela Minha conta › Notificações.

create table if not exists public.notificacao_preferencias (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null,
  canal text not null check (canal in ('zap', 'email')),
  ativo boolean not null default true,
  formato text not null default 'completa' check (formato in ('completa', 'resumida', 'titulo')),
  updated_at timestamptz not null default now(),
  primary key (profile_id, tipo, canal)
);

alter table public.notificacao_preferencias enable row level security;

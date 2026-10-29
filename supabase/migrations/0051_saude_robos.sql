-- Saúde dos robôs (29/10/2026): cada robô (publicações DJEN, andamentos, Drive, robôs
-- próprios dos tribunais na VPS/Vercel) avisa o portal a cada rodada. Falha vira card
-- amarelo/vermelho em Alertas e aviso por e-mail; robô que para de dar sinal também.
-- Só o servidor (service_role) grava; a equipe só lê.

create table if not exists public.robos_status (
  robo text primary key,                         -- ex.: 'publicacoes-djen', 'tjba-pje'
  nome text not null,                            -- como aparece no portal
  grupo text not null default 'andamentos',      -- andamentos | publicacoes | integracoes
  status text not null default 'ok' check (status in ('ok', 'atencao', 'fora', 'pausado')),
  motivo text,                                   -- captcha | bloqueio | fora_do_ar | layout | vazio | sem_sinal | erro
  detalhe text,
  usando_reserva boolean not null default false, -- ex.: DataJud cobrindo enquanto o robô está fora
  intervalo_min integer not null default 180,    -- sem sinal por mais que isso = "fora"
  falhas_seguidas integer not null default 0,
  ultima_ok timestamptz,
  ultima_tentativa timestamptz,
  desde timestamptz not null default now(),      -- quando entrou no status atual
  avisado_em timestamptz,                        -- último e-mail de "fora"
  atualizado_em timestamptz not null default now()
);

create table if not exists public.robos_eventos (
  id bigserial primary key,
  robo text not null references public.robos_status (robo) on delete cascade,
  quando timestamptz not null default now(),
  status text not null,
  motivo text,
  detalhe text
);
create index if not exists robos_eventos_robo_idx on public.robos_eventos (robo, quando desc);

alter table public.robos_status enable row level security;
alter table public.robos_eventos enable row level security;

drop policy if exists "robos_status_equipe" on public.robos_status;
create policy "robos_status_equipe" on public.robos_status for select
  using (public.current_user_role() in ('admin', 'advogado'));

drop policy if exists "robos_eventos_equipe" on public.robos_eventos;
create policy "robos_eventos_equipe" on public.robos_eventos for select
  using (public.current_user_role() in ('admin', 'advogado'));

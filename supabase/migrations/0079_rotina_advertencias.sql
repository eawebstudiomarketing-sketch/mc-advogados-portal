-- 19/11/2026: advertências por relatório do dia não enviado ficam SALVAS (antes eram só calculadas).
-- Uma linha por pessoa e dia de relatório que passou sem relatório enviado no próprio dia.
-- enviado_em: quando o relatório atrasado foi enviado depois (null = ainda faltando).
-- O Maurício vê todas em Painel do Dono → Advertências; cada pessoa vê as suas em Indicadores.
create table if not exists public.rotina_advertencias (
  id uuid primary key default gen_random_uuid(),
  responsavel_id uuid not null references public.responsaveis (id) on delete cascade,
  dia date not null,
  criada_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (responsavel_id, dia)
);

create index if not exists rotina_advertencias_dia_idx on public.rotina_advertencias (dia desc);

alter table public.rotina_advertencias enable row level security;

-- a pessoa lê as próprias; o portal grava e lista tudo pelo servidor (service role)
drop policy if exists "rotina_advertencias_propria" on public.rotina_advertencias;
create policy "rotina_advertencias_propria" on public.rotina_advertencias
  for select to authenticated
  using (exists (select 1 from public.responsaveis r where r.id = responsavel_id and r.profile_id = auth.uid()));

-- 0048 (27/10/2026): fim do contrato + tipo "Audiência" na Agenda.
--
-- 1) Fim do contrato: o campo fica na ficha de handoff (seção 02, jsonb), então não há coluna nova;
--    esta tabela só guarda quais avisos já foram mandados (30 dias antes e último dia) para não repetir.
create table if not exists public.contrato_avisos (
  client_id uuid not null references public.clients (id) on delete cascade,
  fim date not null,
  tipo text not null check (tipo in ('d30', 'd0')),
  enviado_em timestamptz not null default now(),
  primary key (client_id, fim, tipo)
);
alter table public.contrato_avisos enable row level security; -- só o servidor (cron) mexe

-- 2) Audiência como tipo de compromisso da Agenda (igual reunião, com lembretes próprios)
alter table public.compromissos drop constraint if exists compromissos_tipo_check;
alter table public.compromissos add constraint compromissos_tipo_check check (tipo in ('reuniao', 'audiencia', 'ligacao', 'evento', 'outro'));

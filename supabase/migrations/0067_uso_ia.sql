-- Medidor de consumo do Gemini (04/11/2026): cada chamada registra função,
-- modelo, tokens e custo estimado. Só o servidor (chave de serviço) lê/grava.
create table if not exists public.uso_ia (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  funcao text not null,
  modelo text not null,
  entrada integer not null default 0,
  cache integer not null default 0,
  audio integer not null default 0,
  saida integer not null default 0,
  custo_usd numeric(12, 6) not null default 0
);

create index if not exists uso_ia_created_at_idx on public.uso_ia (created_at desc);
create index if not exists uso_ia_funcao_idx on public.uso_ia (funcao, created_at desc);

alter table public.uso_ia enable row level security;

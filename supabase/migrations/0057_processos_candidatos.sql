-- Novo processo por pesquisa (30/10/2026). Antes de entrar no portal, todo processo vira um
-- "candidato": a pessoa pesquisa (número CNJ, nome da parte, OAB, CPF/CNPJ) ou o DJEN acha sozinho,
-- o robô lê o processo no tribunal (prévia com partes, dados e andamentos) e alguém APROVA.
-- Ao aprovar, o processo é criado e o histórico lido entra todo como histórico (sem aviso); dali em
-- diante a coleta de 3 em 3 horas avisa só o que for novo.
--
-- status: lendo (robô na fila) → pronto (prévia lida) | erro (não deu para ler) → aprovado | descartado
-- origem: busca (alguém pesquisou) | djen (publicação de número que o portal não tem)
-- Leitura e escrita pelo servidor (service role, depois de conferir a permissão "processos");
-- a equipe com a permissão só lê.

create table if not exists public.processos_candidatos (
  id uuid primary key default gen_random_uuid(),
  numero_processo text not null,
  numero_digitos text not null,
  origem text not null default 'busca' check (origem in ('busca', 'djen')),
  status text not null default 'lendo' check (status in ('lendo', 'pronto', 'erro', 'aprovado', 'descartado')),
  -- dados do processo (DataJud + DJEN + robô): tribunal, classe, assuntos, órgão, partes, valor…
  resumo jsonb not null default '{}'::jsonb,
  -- leitura do robô no tribunal: { sistema, movs: [{data, texto}], erro }
  leitura jsonb,
  lido_em timestamptz,
  tentativas int not null default 0,
  pedido_por uuid,
  decidido_por uuid,
  decidido_em timestamptz,
  process_id uuid references public.processes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- um candidato em aberto por número (aprovado/descartado podem repetir no histórico)
create unique index if not exists processos_candidatos_aberto_uidx
  on public.processos_candidatos (numero_digitos) where status in ('lendo', 'pronto', 'erro');
create index if not exists processos_candidatos_status_idx on public.processos_candidatos (status, created_at desc);

drop trigger if exists processos_candidatos_updated_at on public.processos_candidatos;
create trigger processos_candidatos_updated_at before update on public.processos_candidatos
  for each row execute function public.set_updated_at();

alter table public.processos_candidatos enable row level security;

drop policy if exists "processos_candidatos_equipe" on public.processos_candidatos;
create policy "processos_candidatos_equipe" on public.processos_candidatos for select
  using (public.current_user_role() in ('admin', 'advogado') and public.tem_permissao('processos'));

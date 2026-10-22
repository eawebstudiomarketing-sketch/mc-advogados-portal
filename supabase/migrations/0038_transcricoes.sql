-- 0038 (out/2026): aba Transcrição (pedido de 22/10). Cada pessoa vê o
-- histórico dela; admin vê o de todos. O áudio fica no VPS só até
-- transcrever (depois é apagado); aqui fica só o texto.
create table if not exists public.transcricoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  titulo text not null default 'Transcrição',
  arquivo_nome text,
  duracao_seg integer,
  modo text not null default 'ambos' check (modo in ('fiel', 'resumo', 'ambos')),
  opcoes jsonb not null default '{}'::jsonb,
  status text not null default 'enviando' check (status in ('enviando', 'processando', 'pronta', 'erro')),
  erro text,
  texto text,
  resumo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transcricoes_dono_idx on public.transcricoes (profile_id, created_at desc);

alter table public.transcricoes enable row level security;
drop policy if exists "transcricoes_ver" on public.transcricoes;
create policy "transcricoes_ver" on public.transcricoes for select
  using (profile_id = public.current_profile_id() or public.current_user_role() = 'admin');
drop policy if exists "transcricoes_criar" on public.transcricoes;
create policy "transcricoes_criar" on public.transcricoes for insert
  with check (profile_id = public.current_profile_id() and public.current_user_role() in ('admin', 'advogado'));
drop policy if exists "transcricoes_editar" on public.transcricoes;
create policy "transcricoes_editar" on public.transcricoes for update
  using (profile_id = public.current_profile_id() or public.current_user_role() = 'admin');
drop policy if exists "transcricoes_apagar" on public.transcricoes;
create policy "transcricoes_apagar" on public.transcricoes for delete
  using (profile_id = public.current_profile_id() or public.current_user_role() = 'admin');

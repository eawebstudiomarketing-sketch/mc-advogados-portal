-- Publicação com dono (05/11/2026): quem é o responsável pela publicação e
-- quem encaminhou. Sem dono definido, vale o responsável do processo.
alter table public.publicacoes
  add column if not exists responsavel_id uuid references public.profiles (id) on delete set null,
  add column if not exists encaminhada_por uuid references public.profiles (id) on delete set null,
  add column if not exists encaminhada_em timestamptz;

create index if not exists publicacoes_responsavel_idx on public.publicacoes (responsavel_id) where responsavel_id is not null;

-- Publicações: estado (UF) para o filtro "Estados", igual ao Astrea. Aditiva.
-- O robô preenche nas novas e completa as antigas na próxima busca.
alter table public.publicacoes add column if not exists uf text;
create index if not exists publicacoes_uf_idx on public.publicacoes (uf);

-- 0024 (out/2026): foto de perfil das pessoas, Distribuição recebendo
-- sugestões das publicações e atualização ao vivo da Distribuição. Aditiva.

-- foto de cada pessoa (ranking, atividades, agenda)
alter table public.responsaveis add column if not exists foto_url text;

-- bucket público só de leitura; quem grava é o servidor (chave de serviço)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Distribuição: nova origem "publicacao" (DJEN/INPI) ligada à publicação
alter table public.distribuicao drop constraint if exists distribuicao_origem_check;
alter table public.distribuicao add constraint distribuicao_origem_check
  check (origem in ('whatsapp', 'portal_cliente', 'publicacao', 'email', 'outro'));
alter table public.distribuicao add column if not exists publicacao_id uuid references public.publicacoes (id) on delete cascade;
create unique index if not exists distribuicao_publicacao_idx on public.distribuicao (publicacao_id) where publicacao_id is not null;

-- a tela da Distribuição atualiza sozinha quando chega sugestão nova
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'distribuicao'
  ) then
    alter publication supabase_realtime add table public.distribuicao;
  end if;
end $$;

-- publicação tratada/descartada na tela Publicações some da Distribuição
create or replace function public.publicacao_sincroniza_distribuicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    update public.distribuicao
      set status = case new.status when 'nao_tratada' then 'pendente' when 'tratada' then 'aceita' else 'descartada' end,
          activity_id = coalesce(new.activity_id, activity_id),
          tratado_em = case when new.status = 'nao_tratada' then null else now() end
      where publicacao_id = new.id;
  end if;
  return new;
end
$$;
drop trigger if exists publicacoes_sincroniza_distribuicao on public.publicacoes;
create trigger publicacoes_sincroniza_distribuicao after update of status on public.publicacoes
  for each row execute function public.publicacao_sincroniza_distribuicao();

-- Segurança e perda de dados (28/10/2026). Aditiva: não muda nenhum dado existente.

-- 1) cliente_do_chat roda com privilégio de dono e estava aberta para qualquer um com a
--    chave pública (anon): dava para descobrir, por telefone ou nome de grupo, quem é
--    cliente do escritório. Só o servidor (service_role) e os gatilhos do banco usam.
revoke all on function public.cliente_do_chat(text, text, boolean) from public, anon, authenticated;
grant execute on function public.cliente_do_chat(text, text, boolean) to service_role;

-- 2) Rede de segurança contra exclusão: antes de apagar uma linha das tabelas principais
--    (inclusive apagada em cascata, ex.: excluir um cliente), uma cópia completa vai para
--    registros_excluidos. Dá para restaurar (restaurar_excluido) por 180 dias.
create table if not exists public.registros_excluidos (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id text,
  dados jsonb not null,
  excluido_por uuid,
  excluido_em timestamptz not null default now()
);
create index if not exists registros_excluidos_tabela_idx on public.registros_excluidos (tabela, excluido_em desc);
alter table public.registros_excluidos enable row level security;
revoke all on public.registros_excluidos from anon, authenticated;

create or replace function public.guardar_excluido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.registros_excluidos (tabela, registro_id, dados, excluido_por)
  values (TG_TABLE_NAME, to_jsonb(OLD) ->> 'id', to_jsonb(OLD), auth.uid());
  return OLD;
end $$;
revoke all on function public.guardar_excluido() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['clients','activities','processes','atas','ata_assinaturas','compromissos','financial_records','contracts','client_handoffs','activity_comments','transcricoes','onboardings','monthly_reports','time_entries','responsaveis','profiles']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists guardar_excluido_trg on public.%I', t);
      execute format('create trigger guardar_excluido_trg before delete on public.%I for each row execute function public.guardar_excluido()', t);
    end if;
  end loop;
end $$;

-- restaura UMA linha apagada (as filhas de um cliente apagado: restaurar o cliente primeiro, depois as demais)
create or replace function public.restaurar_excluido(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r public.registros_excluidos;
begin
  select * into r from public.registros_excluidos where id = p_id;
  if not found then return 'não encontrado'; end if;
  execute format('insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).* on conflict do nothing', r.tabela, r.tabela) using r.dados;
  delete from public.registros_excluidos where id = p_id;
  return 'restaurado em ' || r.tabela;
end $$;
revoke all on function public.restaurar_excluido(uuid) from public, anon, authenticated;
grant execute on function public.restaurar_excluido(uuid) to service_role;

-- limpeza das cópias com mais de 180 dias (chamada pelo cron de saúde)
create or replace function public.limpar_excluidos_antigos() returns integer
language sql security definer set search_path = public as $$
  with d as (delete from public.registros_excluidos where excluido_em < now() - interval '180 days' returning 1) select count(*)::int from d
$$;
revoke all on function public.limpar_excluidos_antigos() from public, anon, authenticated;
grant execute on function public.limpar_excluidos_antigos() to service_role;

-- 3) Uso do banco (alerta antes de bater o limite do plano grátis, 500 MB)
create or replace function public.uso_do_banco() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'bytes', pg_database_size(current_database()),
    'maiores', coalesce((
      select jsonb_agg(jsonb_build_object('tabela', relname, 'bytes', tam))
      from (
        select c.relname, pg_total_relation_size(c.oid) as tam
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by 2 desc limit 5
      ) x
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.uso_do_banco() from public, anon, authenticated;
grant execute on function public.uso_do_banco() to service_role;

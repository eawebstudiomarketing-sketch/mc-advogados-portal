-- Painel do Dono (24/10/2026): só o admin máximo (Maurício e João).
-- 1) Auditoria: quem criou, editou ou excluiu o quê nas tabelas principais
--    (gatilhos; ações de robôs/sistema ficam sem pessoa). Começa a contar agora.
-- 2) Sugestões diárias da IA (painel + WhatsApp do Maurício às 7h).
-- Conversas do assistente de IA NÃO são registradas (decisão do usuário).

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  profile_id uuid references public.profiles (id) on delete set null,
  tabela text not null,
  registro_id text,
  acao text not null check (acao in ('criou', 'editou', 'excluiu')),
  resumo text,
  campos text[]
);
create index if not exists auditoria_quando_idx on public.auditoria (quando desc);
create index if not exists auditoria_pessoa_idx on public.auditoria (profile_id, quando desc);

alter table public.auditoria enable row level security;
drop policy if exists "auditoria_super" on public.auditoria;
create policy "auditoria_super" on public.auditoria for select using (public.current_user_super());

create or replace function public.auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_velho jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_base jsonb := coalesce(v_novo, v_velho);
  v_campos text[];
  v_perfil uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_campos
    from jsonb_each(v_novo) n
    where n.key not in ('updated_at', 'tratado_em')
      and n.value is distinct from v_velho -> n.key;
    if v_campos is null then return new; end if;
  end if;
  begin
    v_perfil := public.current_profile_id();
  exception when others then
    v_perfil := null;
  end;
  insert into public.auditoria (profile_id, tabela, registro_id, acao, resumo, campos)
  values (
    v_perfil,
    tg_table_name,
    v_base ->> 'id',
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'editou' else 'excluiu' end,
    left(coalesce(v_base ->> 'title', v_base ->> 'titulo', v_base ->> 'name', v_base ->> 'description', v_base ->> 'numero_processo', ''), 200),
    v_campos
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['activities', 'clients', 'documents', 'processes', 'financial_records', 'distribuicao', 'atas', 'contracts', 'time_entries', 'compromissos', 'monthly_reports']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists auditar_%1$s on public.%1$s', t);
      execute format('create trigger auditar_%1$s after insert or update or delete on public.%1$s for each row execute function public.auditar()', t);
    end if;
  end loop;
end $$;

create table if not exists public.painel_sugestoes (
  dia date primary key,
  texto text not null,
  metricas jsonb not null default '{}'::jsonb,
  enviado_em timestamptz,
  created_at timestamptz not null default now()
);
alter table public.painel_sugestoes enable row level security;
drop policy if exists "painel_sugestoes_super" on public.painel_sugestoes;
create policy "painel_sugestoes_super" on public.painel_sugestoes for select using (public.current_user_super());

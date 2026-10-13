-- Trava de segurança: lixeira de documentos (2026-09-28).
--  - Todo documento apagado (pela tela, pelo MCP, em massa ao desligar pasta,
--    ou em cascata ao excluir atividade/processo/cliente) é copiado ANTES pra
--    documents_trash por um gatilho. Nada some de vez: fica 30 dias com
--    "Restaurar" em /admin/lixeira. O arquivo físico (Storage/Drive) não é
--    tocado na exclusão; só a limpeza de 30 dias apaga o do Storage. O Drive
--    nunca é apagado pelo portal.
--  - batch_id agrupa o que saiu junto (uma pasta desligada = um lote).
--  - RLS ligada SEM policies e funções só pra service_role: a tela lê e
--    restaura pelo servidor, só admin.
-- Aditiva.

create table public.documents_trash (
  id uuid primary key,                     -- mesmo id do documento
  batch_id uuid not null,
  client_id uuid not null,
  title text not null,
  data jsonb not null,                     -- a linha inteira, pra restaurar igual
  reason text not null,
  meta jsonb,                              -- ex.: {"relink_folder_id": "..."} ao desligar pasta
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);
create index documents_trash_batch_idx on public.documents_trash (batch_id);
create index documents_trash_deleted_at_idx on public.documents_trash (deleted_at);
alter table public.documents_trash enable row level security;

create or replace function public.documents_to_trash() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := nullif(current_setting('app.trash_batch', true), '')::uuid;
  v_reason text := nullif(current_setting('app.trash_reason', true), '');
  v_meta jsonb := nullif(current_setting('app.trash_meta', true), '')::jsonb;
  v_by uuid := nullif(current_setting('app.trash_by', true), '')::uuid;
begin
  if v_batch is null then
    -- sem lote explícito: tudo que saiu na mesma transação vira um lote só
    v_batch := md5('tx' || txid_current()::text)::uuid;
  end if;
  if v_reason is null then
    v_reason := case when pg_trigger_depth() > 1 then 'Excluído junto com atividade, processo ou cliente' else 'Documento excluído' end;
  end if;
  if v_by is null then
    -- quem está logado (a exclusão veio da tela): login -> perfil
    select p.id into v_by from public.profiles p
    where p.user_id = nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
  end if;
  insert into public.documents_trash (id, batch_id, client_id, title, data, reason, meta, deleted_by)
  values (old.id, v_batch, old.client_id, old.title, to_jsonb(old), v_reason, v_meta, v_by)
  on conflict (id) do update set batch_id = excluded.batch_id, data = excluded.data, reason = excluded.reason,
    meta = excluded.meta, deleted_by = excluded.deleted_by, deleted_at = now();
  return old;
end $$;

create trigger documents_to_trash before delete on public.documents
  for each row execute function public.documents_to_trash();

-- Remove vários documentos como UM lote (desligar pasta etc.).
create or replace function public.trash_documents(p_ids uuid[], p_reason text, p_by uuid, p_meta jsonb default null)
returns table (batch_id uuid, removed integer)
language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_count integer;
begin
  perform set_config('app.trash_batch', v_batch::text, true);
  perform set_config('app.trash_reason', coalesce(p_reason, ''), true);
  perform set_config('app.trash_meta', coalesce(p_meta::text, ''), true);
  perform set_config('app.trash_by', coalesce(p_by::text, ''), true);
  delete from public.documents where id = any(p_ids);
  get diagnostics v_count = row_count;
  perform set_config('app.trash_batch', '', true);
  perform set_config('app.trash_reason', '', true);
  perform set_config('app.trash_meta', '', true);
  perform set_config('app.trash_by', '', true);
  return query select v_batch, v_count;
end $$;

-- Restaura um lote. Pula o que não dá (cliente excluído, ou o mesmo arquivo
-- do Drive já voltou pela sincronização); atividade/processo que não existem
-- mais viram vazio.
create or replace function public.restore_documents(p_batch uuid)
returns table (restored integer, skipped integer)
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
  v_restored integer;
begin
  select count(*) into v_total from public.documents_trash where batch_id = p_batch;

  with ok as (
    select t.id, jsonb_populate_record(null::public.documents, t.data) as d
    from public.documents_trash t
    where t.batch_id = p_batch
      and exists (select 1 from public.clients c where c.id = t.client_id)
      and not exists (select 1 from public.documents x where x.id = t.id)
      and not exists (
        select 1 from public.documents x
        where x.client_id = t.client_id and t.data ->> 'drive_file_id' is not null and x.drive_file_id = t.data ->> 'drive_file_id'
      )
  ), ins as (
    insert into public.documents (id, client_id, uploaded_by, category, title, file_path, created_at, activity_id, process_id, drive_file_id, legacy_file_path)
    select (ok.d).id, (ok.d).client_id, (ok.d).uploaded_by, (ok.d).category, (ok.d).title, (ok.d).file_path, (ok.d).created_at,
      case when exists (select 1 from public.activities a where a.id = (ok.d).activity_id) then (ok.d).activity_id end,
      case when exists (select 1 from public.processes p where p.id = (ok.d).process_id) then (ok.d).process_id end,
      (ok.d).drive_file_id, (ok.d).legacy_file_path
    from ok
    returning id
  )
  delete from public.documents_trash t using ins where t.id = ins.id;
  get diagnostics v_restored = row_count;

  return query select v_restored, v_total - v_restored;
end $$;

revoke all on function public.trash_documents(uuid[], text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.restore_documents(uuid) from public, anon, authenticated;
grant execute on function public.trash_documents(uuid[], text, uuid, jsonb) to service_role;
grant execute on function public.restore_documents(uuid) to service_role;

-- MC Advogados Portal — bucket de documentos + políticas de Storage
-- Convenção de caminho: {client_id}/{arquivo} — o primeiro segmento do
-- caminho SEMPRE precisa bater com o client_id, e a política usa isso pra
-- decidir quem pode ler/escrever, do mesmo jeito que document_chunks usa
-- client_id nas tabelas normais.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_bucket_select" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      public.current_user_role() in ('admin', 'advogado')
      or (storage.foldername(name))[1] = public.current_user_client_id()::text
    )
  );

create policy "documents_bucket_staff_write" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and public.current_user_role() in ('admin', 'advogado')
  );

create policy "documents_bucket_staff_update" on storage.objects for update
  using (
    bucket_id = 'documents'
    and public.current_user_role() in ('admin', 'advogado')
  )
  with check (
    bucket_id = 'documents'
    and public.current_user_role() in ('admin', 'advogado')
  );

create policy "documents_bucket_staff_delete" on storage.objects for delete
  using (
    bucket_id = 'documents'
    and public.current_user_role() in ('admin', 'advogado')
  );

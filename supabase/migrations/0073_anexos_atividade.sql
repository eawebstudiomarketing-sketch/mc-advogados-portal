-- Anexos da atividade (06/11/2026): qualquer arquivo, na hora de criar ou
-- depois, inclusive em atividade sem cliente. Por padrão o anexo é INTERNO (só a
-- equipe vê); marcando "mostrar ao cliente", aparece no portal dele.
alter table public.documents alter column client_id drop not null;
alter table public.documents add column if not exists interno boolean not null default false;

-- o cliente não vê documento interno (nem ATA, como já era)
drop policy if exists "documents_client_select" on public.documents;
create policy "documents_client_select" on public.documents for select
  using (client_id = public.current_user_client_id() and category::text <> 'ata' and not interno);

-- anexo de atividade sem cliente: a equipe vê se vê a atividade
drop policy if exists "documents_equipe_select_sem_cliente" on public.documents;
create policy "documents_equipe_select_sem_cliente" on public.documents for select
  using (client_id is null and activity_id is not null and exists (select 1 from public.activities a where a.id = activity_id));

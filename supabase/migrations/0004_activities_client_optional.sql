-- Astrea sync: tarefas administrativas/internas do escritório não têm
-- cliente associado (ex: organização interna, follow-up pessoal). O
-- portal precisa aceitar isso — client_id deixa de ser obrigatório em
-- activities. As RLS policies existentes já funcionam sem alteração:
-- "activities_client_select" compara client_id = current_user_client_id(),
-- que nunca bate com NULL (cliente nunca vê tarefa sem client_id, correto);
-- "activities_staff_all" não filtra por client_id (admin/advogado seguem
-- vendo tudo, incluindo as sem cliente).

alter table public.activities alter column client_id drop not null;

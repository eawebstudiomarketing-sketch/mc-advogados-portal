-- 0059 (30/10/2026): subtarefas/checklist dentro da atividade (item 21 da auditoria).
-- Lista simples guardada na própria atividade: [{ "id": "...", "texto": "...", "feito": false }].
alter table public.activities add column if not exists checklist jsonb not null default '[]'::jsonb;

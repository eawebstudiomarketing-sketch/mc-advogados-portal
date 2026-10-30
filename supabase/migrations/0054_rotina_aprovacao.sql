-- 0054 (30/10/2026): aprovação dos relatórios de rotina.
--  * rotina_relatorios: nota (0 a 10) e comentário dados por quem aprova, quando aprovou, e quando/quem
--    editou o relatório depois de enviado (só o admin máximo edita);
--  * rotina_modelos.aprovador_id: quem aprova os relatórios desse modelo (vazio = o admin máximo).

alter table public.rotina_relatorios add column if not exists nota smallint check (nota between 0 and 10);
alter table public.rotina_relatorios add column if not exists comentario text;
alter table public.rotina_relatorios add column if not exists aprovado_em timestamptz;
alter table public.rotina_relatorios add column if not exists aprovado_por uuid;
alter table public.rotina_relatorios add column if not exists editado_em timestamptz;
alter table public.rotina_relatorios add column if not exists editado_por uuid;

alter table public.rotina_modelos add column if not exists aprovador_id uuid references public.responsaveis (id) on delete set null;

create index if not exists rotina_relatorios_aprovacao_idx on public.rotina_relatorios (aprovado_em) where nota is not null;

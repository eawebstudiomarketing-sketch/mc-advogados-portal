-- 17/11/2026: responsável da equipe por cada marca (recebe no WhatsApp o aviso
-- de despacho quando sai a revista do INPI, junto com o Maurício).
alter table public.marcas
  add column if not exists responsavel_id uuid references public.responsaveis (id) on delete set null;

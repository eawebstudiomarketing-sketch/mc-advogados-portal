-- 0032 (out/2026): rotina com horário (início/fim) e observação em cada item.
alter table public.rotina_itens add column if not exists hora_inicio time;
alter table public.rotina_itens add column if not exists hora_fim time;
alter table public.rotina_itens add column if not exists observacao text;

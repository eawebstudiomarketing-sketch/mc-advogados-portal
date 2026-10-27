-- 0042 (out/2026): corrige a grafia "Francielle" (dois L) para "Franciele" no
-- cadastro da equipe. Só troca o nome; sobrenome, e-mail e vínculos ficam
-- como estão. Pode rodar mais de uma vez (a segunda não altera nada).

update public.profiles
  set full_name = replace(full_name, 'Francielle', 'Franciele')
  where full_name like '%Francielle%';

update public.responsaveis
  set nome = replace(nome, 'Francielle', 'Franciele')
  where nome like '%Francielle%';

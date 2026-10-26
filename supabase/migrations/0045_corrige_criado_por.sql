-- 0045 (26/10/2026): corrige a 0044. A coluna activities.criado_por tinha chave estrangeira
-- para profiles, o que deixou "profiles(full_name)" ambíguo nas telas que listam atividades
-- (erro PGRST201). Sem a chave, o resto do sistema volta a funcionar; a coluna continua valendo
-- para quem cria uma atividade para outra pessoa continuar vendo o que criou.
alter table public.activities drop constraint if exists activities_criado_por_fkey;
notify pgrst, 'reload schema';

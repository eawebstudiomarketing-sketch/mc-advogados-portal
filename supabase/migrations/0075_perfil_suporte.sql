-- 0075 (10/11/2026): conta de Suporte visível, como categoria própria.
--
-- A conta técnica "Suporte" (do JV) era oculta. Agora aparece em tudo como
-- membro da equipe (Equipe, responsáveis, rotinas, Painel), com a etiqueta
-- "Suporte" em vez de "Admin máximo". Por enquanto tem os mesmos poderes do
-- Maurício (continua super_admin); depois ele decide o que ela faz.

alter table public.profiles add column if not exists suporte boolean not null default false;

-- tirar o "oculto" dispara o gatilho profiles_sync_responsavel, que cria o
-- responsável dela (para poder receber atividades e ter rotina)
update public.profiles
   set suporte = true, oculto = false
 where email = 'eawebstudiomarketing@gmail.com';

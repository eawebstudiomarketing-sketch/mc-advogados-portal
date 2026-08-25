-- Portal do cliente ganha capacidade de auto-lançamento: o próprio cliente
-- pode registrar suas atividades e horas, sem depender da equipe pra isso.
-- Mantém client_id e o "autor" (advogado_id / responsible_id) travados no
-- próprio registro do usuário via with check — nunca confia no client_id
-- ou author id vindos do formulário.

create policy "time_entries_client_insert" on public.time_entries for insert
  with check (
    public.current_user_role() = 'client'
    and client_id = public.current_user_client_id()
    and advogado_id = public.current_profile_id()
  );

create policy "activities_client_insert" on public.activities for insert
  with check (
    public.current_user_role() = 'client'
    and client_id = public.current_user_client_id()
    and responsible_id = public.current_profile_id()
  );

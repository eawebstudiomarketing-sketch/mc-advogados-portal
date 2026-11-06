-- Regras da rotina (06/11/2026): o que era fixo no código (horário limite do
-- relatório do dia, exceção por pessoa, avisos antes do limite, aviso de atraso
-- ao dono, dias com relatório, resumo do fim do dia no Zap) o admin máximo edita
-- em Rotinas → Regras. Vazio = valem os padrões do código (comportamento de 05/11).
alter table public.escritorio_config add column if not exists rotina_regras jsonb not null default '{}'::jsonb;

-- Eventos do pixel próprio dos formulários (16/11/2026). Tudo fica no portal,
-- nada vai para Meta ou Google. Uma linha por evento de uma visita:
-- PageView, ViewContent, FormStart, FormFieldComplete (qual pergunta, nunca o
-- que foi digitado), FormSubmit, Lead, CompleteRegistration, SubmitApplication,
-- Contact e WhatsAppClick. A visita (crm_visitas) traz origem, aparelho e cidade.
-- Apagados sozinhos depois de 90 dias. Aditiva.

create table if not exists public.crm_eventos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  formulario_id uuid not null references public.crm_formularios (id) on delete cascade,
  visita text not null,
  visitante text,
  lead_id uuid references public.leads (id) on delete set null,
  evento text not null check (evento in ('PageView','ViewContent','FormStart','FormFieldComplete','FormSubmit','Lead','CompleteRegistration','SubmitApplication','Contact','WhatsAppClick')),
  pergunta int,   -- FormFieldComplete: número da pergunta (1, 2, 3…)
  campo text      -- FormFieldComplete: id da pergunta
);

create index if not exists crm_eventos_form_idx on public.crm_eventos (formulario_id, criado_em desc);
create index if not exists crm_eventos_criado_idx on public.crm_eventos (criado_em desc);
create index if not exists crm_eventos_visita_idx on public.crm_eventos (visita);
create index if not exists crm_eventos_lead_idx on public.crm_eventos (lead_id) where lead_id is not null;

alter table public.crm_eventos enable row level security;

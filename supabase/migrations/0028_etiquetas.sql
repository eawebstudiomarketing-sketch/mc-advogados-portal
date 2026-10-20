-- 0028 (out/2026): etiquetas nas atividades (pedido de 20/10).
--  * etiquetas: lista do escritório (nome + cor), qualquer pessoa da equipe cria;
--  * activities.etiquetas: ids das etiquetas da atividade (põe/tira a qualquer momento).

create table if not exists public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  cor text not null default '#475569',
  created_at timestamptz not null default now()
);
create unique index if not exists etiquetas_nome_idx on public.etiquetas (lower(nome));

alter table public.etiquetas enable row level security;
drop policy if exists "etiquetas_equipe_all" on public.etiquetas;
create policy "etiquetas_equipe_all" on public.etiquetas for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

alter table public.activities add column if not exists etiquetas uuid[] not null default '{}';
create index if not exists activities_etiquetas_idx on public.activities using gin (etiquetas);

insert into public.etiquetas (nome, cor) values
  ('3N ENGENHARIA', '#2563eb'),
  ('Aguardando documentação', '#d97706'),
  ('Aguardando retorno do cliente', '#d97706'),
  ('ASSESSORIA JURIDICA', '#b8892f'),
  ('Audiência cancelada', '#64748b'),
  ('Audiência de Conciliação', '#7c3aed'),
  ('Audiência de Instrução e Julgamento', '#7c3aed'),
  ('Audiência de Mediação', '#7c3aed'),
  ('Audiência UNA', '#7c3aed'),
  ('BRUNOU HOUSE190', '#0891b2'),
  ('CONSÓRCIO CONTEMPLADO', '#0d9488'),
  ('Despachado', '#16a34a'),
  ('DINOS - BIOCALE COSMÉTICOS', '#db2777'),
  ('Dra. Franciele Vieira', '#4f46e5'),
  ('Dra. Talita Duarte', '#4f46e5'),
  ('Feito', '#16a34a'),
  ('Ferraz Alimentos', '#ea580c'),
  ('FIES', '#0d9488'),
  ('G O ALVES ARTE SABOR', '#ca8a04'),
  ('Grupo Djalma', '#0891b2'),
  ('GRUPO LD', '#2563eb'),
  ('HENRI - ATIVE MARKET', '#059669'),
  ('HERCULANO- VITALLIS PROFISSIONAL', '#9333ea'),
  ('Jurandir - Sabor de Minas', '#b45309'),
  ('LINK MEN', '#475569'),
  ('Não acessar pelo Token', '#dc2626'),
  ('POLIMAQ', '#0369a1'),
  ('Prazo', '#dc2626'),
  ('Protocolado', '#16a34a'),
  ('RAFAEL - STUDIO FIT', '#e11d48'),
  ('Recebida', '#2563eb'),
  ('REVISAR', '#ea580c'),
  ('ROBSON - KADOSHI', '#0f766e'),
  ('Dr. Maurício Cardoso', '#4f46e5')
on conflict do nothing;

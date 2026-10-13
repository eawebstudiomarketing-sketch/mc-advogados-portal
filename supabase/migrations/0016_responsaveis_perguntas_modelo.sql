-- 0016 (out/2026): responsáveis com ou sem login + perguntas extras do modelo de onboarding.
-- Só acrescenta (tabelas/colunas novas); nada existente é alterado.

-- ───────────── Responsáveis ─────────────
-- Pessoa que responde por uma atividade. Pode ser alguém da equipe (com login,
-- profile_id preenchido) ou só nome + Gmail (sem login). Se a pessoa ganhar
-- login depois, o gatilho abaixo une os dois pelo e-mail.
create table public.responsaveis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  profile_id uuid unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index responsaveis_email_idx on public.responsaveis (lower(email));

alter table public.responsaveis enable row level security;
create policy "responsaveis_equipe_all" on public.responsaveis for all
  using (public.current_user_role() in ('admin', 'advogado'))
  with check (public.current_user_role() in ('admin', 'advogado'));

-- equipe atual entra como responsável
insert into public.responsaveis (nome, email, profile_id)
select full_name, email, id from public.profiles
where role in ('admin', 'advogado') and email is not null
on conflict do nothing;

alter table public.activities
  add column responsavel_id uuid references public.responsaveis (id) on delete set null;
create index activities_responsavel_idx on public.activities (responsavel_id);

update public.activities a set responsavel_id = r.id
from public.responsaveis r
where r.profile_id = a.responsible_id and a.responsavel_id is null;

-- Atividade criada sem responsável (assistente, MCP, portal do cliente) ou com
-- o responsible_id trocado: o responsável vira a pessoa da equipe correspondente.
create or replace function public.activities_preenche_responsavel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsavel_id is null
     or (tg_op = 'UPDATE' and new.responsible_id is distinct from old.responsible_id
         and new.responsavel_id is not distinct from old.responsavel_id) then
    select id into new.responsavel_id from public.responsaveis where profile_id = new.responsible_id;
  end if;
  return new;
end;
$$;

create trigger activities_preenche_responsavel
  before insert or update of responsible_id, responsavel_id on public.activities
  for each row execute function public.activities_preenche_responsavel();

-- Perfil da equipe criado/alterado: une ao responsável de mesmo e-mail ou cria um.
create or replace function public.sync_responsavel_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('admin', 'advogado') and new.email is not null then
    update public.responsaveis
       set profile_id = new.id
     where lower(email) = lower(new.email) and (profile_id is null or profile_id = new.id);
    if not found then
      insert into public.responsaveis (nome, email, profile_id)
      values (new.full_name, new.email, new.id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_responsavel
  after insert or update of role, email on public.profiles
  for each row execute function public.sync_responsavel_profile();

-- ───────────── Perguntas extras do modelo de onboarding ─────────────
-- Perguntas que o admin marcou como "usar também nos próximos onboardings";
-- entram no fim da etapa (stage_id = e1..e7) em todo onboarding novo.
create table public.onboarding_perguntas_modelo (
  id uuid primary key default gen_random_uuid(),
  stage_id text not null,
  texto text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.onboarding_perguntas_modelo enable row level security;
create policy "onboarding_perguntas_modelo_admin_all" on public.onboarding_perguntas_modelo for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

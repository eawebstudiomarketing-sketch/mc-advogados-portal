-- Integração com Google Drive (conta do Maurício, autorizada uma vez por OAuth).
--
-- drive_connection: uma única linha (singleton). RLS ligada SEM nenhuma
-- policy de propósito — o refresh_token é um segredo, então só o servidor
-- (service_role) lê e grava; nem admin logado enxerga pelo Supabase client.
--
-- clients.drive_folder_id: subpasta do cliente dentro da pasta raiz
-- "Clientes MC" (criada lazy, no primeiro upload).
-- documents.drive_file_id: quando preenchido, o arquivo está no Drive (e
-- file_path guarda só o marcador 'drive/<id>'); quando nulo, segue no
-- Supabase Storage como sempre foi. Os arquivos antigos não são tocados.

create table public.drive_connection (
  id boolean primary key default true check (id),
  account_email text not null,
  refresh_token text not null,
  root_folder_id text not null,
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.drive_connection enable row level security;

alter table public.clients add column drive_folder_id text;
alter table public.documents add column drive_file_id text;

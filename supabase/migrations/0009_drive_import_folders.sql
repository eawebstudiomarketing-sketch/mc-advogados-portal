-- Pastas do Drive que JÁ existiam (fora de "Clientes MC") e foram ligadas a um
-- cliente pelo assistente "Importar pastas do Drive". O portal só LÊ essas
-- pastas (permissão drive.readonly): a sincronização passa a trazer também o que
-- for novo nelas. Escrita continua só na pasta que o próprio portal cria
-- (clients.drive_folder_id). Aditiva.

alter table public.clients
  add column drive_import_folder_ids text[] not null default '{}';

-- 0064 (31/10/2026): foto de perfil do cliente (logo da empresa ou foto da
-- pessoa), tirada do WhatsApp. Fica no bucket público "avatars" (0024). Aditiva.
alter table public.clients add column if not exists foto_url text;

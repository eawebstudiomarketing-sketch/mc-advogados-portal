-- Atas (22/10/2026): opção "Enviar pela ZapSign" (API oficial) para atas
-- complexas, carimbo do tempo RFC 3161 no fechamento, selo PAdES do escritório
-- (quando houver certificado A1) e testemunhas como signatárias.

alter table public.atas
  add column if not exists assinatura_via text not null default 'portal' check (assinatura_via in ('portal', 'zapsign')),
  add column if not exists zapsign_token text,
  add column if not exists zapsign_sincronizado_em timestamptz,
  -- carimbo do tempo do conteúdo assinado: { tsa, serie, quando, politica, arquivo }
  add column if not exists carimbo jsonb,
  add column if not exists selo_escritorio boolean not null default false;

alter table public.ata_assinaturas
  add column if not exists zapsign_token text,
  add column if not exists link_externo text;

alter table public.ata_assinaturas drop constraint if exists ata_assinaturas_papel_check;
alter table public.ata_assinaturas add constraint ata_assinaturas_papel_check
  check (papel in ('escritorio', 'cliente', 'testemunha', 'outro'));

-- Assinatura das atas no nível da ZapSign (22/10/2026): assinatura desenhada
-- ou digitada (+ rubrica), localização (GPS do aparelho e cidade pelo IP),
-- selfie e foto do documento conferidas pela IA, certificado digital A1
-- (assinatura destacada .p7s), recusa, ordem de assinatura, observadores,
-- prazo e lembretes por ata, e código de validação público (/validar).
-- Imagens e .p7s ficam no Storage (bucket documents, pasta interna da ata) e
-- são apagadas junto com a ata.

alter table public.atas
  add column if not exists codigo_validacao text unique,
  add column if not exists pdf_final_hash text,
  add column if not exists ordem_assinatura boolean not null default false,
  add column if not exists prazo_assinatura timestamptz,
  add column if not exists lembretes_dias int[] not null default '{2,5}';

alter table public.ata_assinaturas
  add column if not exists observador boolean not null default false,
  add column if not exists ordem int not null default 1,
  -- o que a pessoa precisa apresentar além do código: { selfie, documento, certificado }
  add column if not exists exige jsonb not null default '{}'::jsonb,
  add column if not exists cpf text,
  add column if not exists assinatura_path text,
  add column if not exists assinatura_tipo text,
  -- { gps: { lat, lng, precisao } | null, ip: { cidade, uf, pais } | null }
  add column if not exists local jsonb,
  add column if not exists selfie_path text,
  add column if not exists documento_paths jsonb,
  -- conferência da IA: { mesma_pessoa, nome_confere, cpf_confere, tipo, observacao }
  add column if not exists verificacao jsonb,
  add column if not exists consentimento_biometria_em timestamptz,
  add column if not exists certificado jsonb,
  add column if not exists p7s_path text,
  add column if not exists recusa text;

alter table public.ata_assinaturas drop constraint if exists ata_assinaturas_status_check;
alter table public.ata_assinaturas add constraint ata_assinaturas_status_check
  check (status in ('pendente', 'assinada', 'correcao', 'recusada', 'cancelada'));

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Módulo Marcas (30/10/2026): leitura da carteira para as telas (Principal,
// Processos, ficha, Revistas e Colidências). Escrita fica nas actions e nos
// robôs (service role, depois de conferir a permissão "marcas").

export type Marca = {
  id: string;
  tipo: "marca" | "patente" | "desenho" | "programa";
  processo: string;
  nome: string | null;
  apelido: string | null;
  apresentacao: string | null;
  natureza: string | null;
  classe: string | null;
  status_classe: string | null;
  especificacao: string | null;
  cfe: string | null;
  titular: string | null;
  titular_uf: string | null;
  procurador: string | null;
  deposito: string | null;
  concessao: string | null;
  vigencia: string | null;
  situacao: string | null;
  ultimo_despacho: string | null;
  ultimo_despacho_codigo: string | null;
  ultimo_despacho_data: string | null;
  ultima_rpi: number | null;
  previsao: string | null;
  imagem: string | null;
  client_id: string | null;
  acompanhando: boolean;
  avisar_cliente: boolean;
  colidencia: boolean;
  colid_auto: boolean;
  colid_escopo: number;
  colid_sensibilidade: number;
  colid_termos: Record<string, number>;
  colid_extras: string[];
  colid_ignorar: string[];
  observacao: string | null;
  contato_nome: string | null;
  contato_numero: string | null;
  status_mensagem: string | null;
  created_at: string;
  clients?: { name: string } | null;
};

export type Publicacao = { id: number; rpi: number; data: string; codigo: string; despacho: string; info: string | null; avisado_em: string | null };
export type Prazo = { id: string; marca_id: string; acao: string; vence_em: string; situacao: "pendente" | "realizado" | "perdido" | "dispensado"; activity_id: string | null };
export type Revista = { numero: number; data: string; processada_em: string | null; total_processos: number | null; despachos_nossos: number | null; colidencias: number | null; pdf_url: string | null };
export type Colidencia = {
  id: string;
  marca_id: string;
  rpi: number;
  processo: string;
  nome: string | null;
  classe: string | null;
  titular: string | null;
  despacho: string | null;
  semelhanca: number | null;
  risco: "alto" | "medio" | "baixo";
  status: "pendente" | "revisada" | "acao" | "monitorando";
  observacao: string | null;
};

// as tabelas novas (0061) ainda não estão nos tipos gerados (mesmo jeito do Painel do Dono)
const db = async () => (await createClient()) as unknown as SupabaseClient;

/** Nome que aparece na tela: o nome no INPI, o apelido ou o aviso de figurativa. */
export const nomeDaMarca = (m: Pick<Marca, "nome" | "apelido">) => m.nome?.trim() || m.apelido?.trim() || "Marca figurativa (apelido não configurado)";

export async function listMarcas(filtro: { tipo?: Marca["tipo"]; acompanhando?: boolean } = {}): Promise<Marca[]> {
  let q = (await db()).from("marcas").select("*, clients(name)").order("ultimo_despacho_data", { ascending: false, nullsFirst: false });
  q = q.eq("tipo", filtro.tipo ?? "marca");
  if (filtro.acompanhando !== false) q = q.eq("acompanhando", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getMarca(processo: string): Promise<{ marca: Marca; publicacoes: Publicacao[]; prazos: Prazo[]; colidencias: Colidencia[] } | null> {
  const banco = await db();
  const { data: marca } = await banco.from("marcas").select("*, clients(name)").eq("processo", processo).maybeSingle();
  if (!marca) return null;
  const [{ data: publicacoes }, { data: prazos }, { data: colidencias }] = await Promise.all([
    banco.from("marca_publicacoes").select("*").eq("marca_id", marca.id).order("rpi", { ascending: true }),
    banco.from("marca_prazos").select("*").eq("marca_id", marca.id).order("vence_em"),
    banco.from("marca_colidencias").select("*").eq("marca_id", marca.id).order("semelhanca", { ascending: false }).limit(50),
  ]);
  return { marca, publicacoes: publicacoes ?? [], prazos: prazos ?? [], colidencias: colidencias ?? [] };
}

export type PrazoComMarca = Prazo & { marcas: Pick<Marca, "processo" | "nome" | "apelido" | "tipo" | "client_id"> & { clients: { name: string } | null } };

export async function listPrazos(): Promise<PrazoComMarca[]> {
  const { data } = await (await db())
    .from("marca_prazos")
    .select("*, marcas!inner(processo, nome, apelido, tipo, client_id, acompanhando, clients(name))")
    .eq("marcas.acompanhando", true)
    .order("vence_em");
  return data ?? [];
}

export async function listRevistas(): Promise<Revista[]> {
  const { data } = await (await db()).from("rpi_revistas").select("*").order("numero", { ascending: false });
  return data ?? [];
}

/** Despachos de uma revista para a carteira (tela Principal e Revistas). */
export async function despachosDaRevista(rpi: number): Promise<(Publicacao & { marcas: Pick<Marca, "processo" | "nome" | "apelido" | "tipo"> })[]> {
  const { data } = await (await db()).from("marca_publicacoes").select("*, marcas!inner(processo, nome, apelido, tipo)").eq("rpi", rpi).order("id");
  return data ?? [];
}

export async function listColidencias(rpi?: number): Promise<(Colidencia & { marcas: Pick<Marca, "processo" | "nome" | "apelido" | "classe"> })[]> {
  let q = (await db()).from("marca_colidencias").select("*, marcas!inner(processo, nome, apelido, classe)").order("semelhanca", { ascending: false });
  if (rpi) q = q.eq("rpi", rpi);
  const { data } = await q.limit(500);
  return data ?? [];
}

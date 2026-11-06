import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureClientFolder, ensureSubfolder, getDriveSession, uploadBytes } from "@/lib/google-drive";

// Anexos da atividade (06/11/2026, pedido do usuário): qualquer tipo de arquivo,
// na hora de criar a atividade ou depois (mini tela e página da atividade),
// inclusive em atividade sem cliente. O arquivo sobe do navegador direto para
// o Storage (link assinado, sem o limite de tamanho da Vercel) e vira uma linha
// em `documents`. Por padrão é INTERNO (só a equipe vê); "mostrar ao cliente"
// deixa aparecer no portal dele (migration 0073: documents.interno e
// client_id opcional). Com o Drive conectado e cliente na atividade, o arquivo
// vai depois para a pasta do cliente no Drive (internos na subpasta "Interno",
// que a sincronização não lê). Quem vê a atividade vê os anexos dela.

const adm = () => createAdminClient() as unknown as SupabaseClient;
export const LIMITE_ANEXO_MB = 50;

export type Anexo = { id: string; title: string; created_at: string; downloadUrl: string | null; drive_file_id: string | null; interno: boolean; meu: boolean };

const limparNome = (nome: string) =>
  nome
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-120) || "arquivo";

/** A atividade, lida com o login da pessoa (RLS): null = ela não vê. */
export async function atividadeVisivel(activityId: string): Promise<{ id: string; client_id: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(activityId)) return null;
  const { data } = await (await createClient()).from("activities").select("id, client_id").eq("id", activityId).maybeSingle();
  return data ?? null;
}

function pastaDe(a: { id: string; client_id: string | null }, interno: boolean) {
  if (!a.client_id) return `internal/atividades/${a.id}`;
  return interno ? `internal/${a.client_id}/atividades/${a.id}` : `${a.client_id}/atividades/${a.id}`;
}

/** Link para o navegador mandar o arquivo direto ao Storage. `pendente` = atividade ainda não criada. */
export async function linkDeEnvio(destino: { atividade: { id: string; client_id: string | null }; interno: boolean } | { pendente: string }, nome: string) {
  const pasta = "pendente" in destino ? `internal/pendentes/${destino.pendente}` : pastaDe(destino.atividade, destino.interno);
  const caminho = `${pasta}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${limparNome(nome)}`;
  const { data, error } = await adm().storage.from("documents").createSignedUploadUrl(caminho);
  if (error || !data) throw new Error("Não foi possível preparar o envio. Tente de novo.");
  return { caminho, token: data.token };
}

/** Grava o anexo já enviado. Confere que o arquivo está na pasta certa e existe. */
export async function registrarAnexo(p: { atividade: { id: string; client_id: string | null }; caminho: string; nome: string; interno: boolean; profileId: string; pendente?: string }): Promise<string> {
  // sem cliente não há portal de cliente: sempre interno
  const interno = !p.atividade.client_id || p.interno;
  let caminho = p.caminho;
  if (p.pendente) {
    if (!caminho.startsWith(`internal/pendentes/${p.pendente}/`)) throw new Error("Arquivo inválido.");
    const final = `${pastaDe(p.atividade, interno)}/${caminho.split("/").pop()}`;
    const { error } = await adm().storage.from("documents").move(caminho, final);
    if (error) throw new Error("Não foi possível guardar o arquivo enviado.");
    caminho = final;
  } else if (!caminho.startsWith(`${pastaDe(p.atividade, interno)}/`)) {
    throw new Error("Arquivo inválido.");
  }
  const titulo = p.nome.trim().slice(0, 200) || "Arquivo";
  const { data, error } = await adm()
    .from("documents")
    .insert({ client_id: p.atividade.client_id, activity_id: p.atividade.id, uploaded_by: p.profileId, category: "outros", title: titulo, file_path: caminho, interno })
    .select("id")
    .single();
  if (error || !data) {
    await adm().storage.from("documents").remove([caminho]);
    throw new Error(/interno|client_id/.test(error?.message ?? "") ? "Falta rodar a migration 0073 no banco." : "Não foi possível anexar o arquivo.");
  }
  const clientId = p.atividade.client_id;
  if (clientId) after(() => levarParaDrive(data.id as string, clientId, caminho, titulo, interno).catch((e) => console.error("anexo → Drive:", (e as Error).message)));
  return data.id as string;
}

/** Copia o arquivo para a pasta do cliente no Drive e libera o Storage (como o "Enviar documento"). */
async function levarParaDrive(docId: string, clientId: string, caminho: string, nome: string, interno: boolean) {
  const session = await getDriveSession();
  if (!session) return;
  const { data: cli } = await adm().from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!cli) return;
  const { data: blob, error } = await adm().storage.from("documents").download(caminho);
  if (error || !blob) return;
  const pasta = await ensureClientFolder(session.token, session.connection, cli as { id: string; name: string });
  const destino = interno ? await ensureSubfolder(session.token, pasta, "Interno") : pasta;
  const fileId = await uploadBytes(session.token, { name: nome, mimeType: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()), parentId: destino });
  const { error: e2 } = await adm().from("documents").update({ drive_file_id: fileId, file_path: `drive/${fileId}` }).eq("id", docId);
  if (!e2) await adm().storage.from("documents").remove([caminho]);
}

/** Anexos de uma atividade que a pessoa já vê (quem chama confere com atividadeVisivel). */
export async function anexosDaAtividade(activityId: string, profileId: string): Promise<Anexo[]> {
  const { data } = await adm().from("documents").select("*").eq("activity_id", activityId).order("created_at", { ascending: false });
  const linhas = (data ?? []) as { id: string; title: string; created_at: string; file_path: string; drive_file_id: string | null; interno?: boolean; uploaded_by: string }[];
  const semDrive = linhas.filter((d) => !d.drive_file_id).map((d) => d.file_path);
  const { data: assinados } = semDrive.length ? await adm().storage.from("documents").createSignedUrls(semDrive, 3600) : { data: [] };
  const url = new Map((assinados ?? []).map((s) => [s.path, s.signedUrl]));
  return linhas.map((d) => ({
    id: d.id,
    title: d.title,
    created_at: d.created_at,
    drive_file_id: d.drive_file_id,
    downloadUrl: d.drive_file_id ? `/api/documents/${d.id}/download` : (url.get(d.file_path) ?? null),
    interno: !!d.interno,
    meu: d.uploaded_by === profileId,
  }));
}

/** Tira o anexo (vai para a lixeira de documentos). Quem enviou ou um admin. */
export async function removerAnexo(activityId: string, docId: string, profileId: string, admin: boolean) {
  const { data } = await adm().from("documents").select("id, uploaded_by").eq("id", docId).eq("activity_id", activityId).maybeSingle();
  if (!data) throw new Error("Anexo não encontrado.");
  if (!admin && data.uploaded_by !== profileId) throw new Error("Só quem enviou (ou um administrador) tira o anexo.");
  const { error } = await adm().from("documents").delete().eq("id", docId);
  if (error) throw new Error("Não foi possível tirar o anexo.");
}

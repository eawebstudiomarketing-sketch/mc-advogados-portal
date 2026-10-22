import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { duracaoLegivel, MODO_ROTULO, type ModoTranscricao } from "@/lib/transcricao-formato";
import type { Ctx, ToolDef } from "./tools";

// Transcrições (aba Transcrição): o assistente lista e lê as do usuário
// (admin: as de todos), para responder, resumir ou usar em outra tarefa.

const db = () => createAdminClient() as unknown as SupabaseClient;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const dataBr = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Admin vê todas; advogado só as dele. */
const doUsuario = <Q extends { eq: (c: string, v: string) => Q }>(q: Q, ctx: Ctx) => (ctx.role === "admin" ? q : q.eq("profile_id", ctx.profileId));

export const TOOLS_TRANSCRICAO: ToolDef[] = [
  {
    name: "listar_transcricoes",
    kind: "read",
    label: "Consultou as transcrições",
    description: "Lista as transcrições de áudio feitas na aba Transcrição (título, data, duração, tipo, se tem resumo). Filtro opcional por palavra no título/nome do arquivo.",
    parameters: obj({ busca: { type: "string" }, limite: { type: "integer" } }),
    run: async (a, ctx) => {
      let q = db()
        .from("transcricoes")
        .select("id, titulo, arquivo_nome, modo, status, duracao_seg, created_at, resumo, texto, profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(a.limite) || 20, 50));
      const termo = String(a.busca ?? "").replace(/[%_,()]/g, " ").trim();
      if (termo) q = q.or(`titulo.ilike.%${termo}%,arquivo_nome.ilike.%${termo}%`);
      const { data, error } = await doUsuario(q, ctx);
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id,
        titulo: t.titulo,
        data: dataBr(t.created_at),
        duracao: t.duracao_seg ? duracaoLegivel(t.duracao_seg) : null,
        tipo: MODO_ROTULO[t.modo as ModoTranscricao],
        situacao: t.status,
        tem_transcricao: !!t.texto,
        tem_resumo: !!t.resumo,
        de: (t.profiles as unknown as { full_name: string } | null)?.full_name ?? null,
      }));
    },
  },
  {
    name: "ler_transcricao",
    kind: "read",
    label: "Leu uma transcrição",
    description: "Lê o texto de uma transcrição (pelo id ou por parte do título): a transcrição fiel e/ou o resumo. Use para responder perguntas sobre uma reunião/áudio transcrito ou reaproveitar o conteúdo.",
    parameters: obj({ id: { type: "string" }, titulo: { type: "string" }, parte: { type: "string", enum: ["ambos", "texto", "resumo"] } }),
    run: async (a, ctx) => {
      let q = db().from("transcricoes").select("id, titulo, created_at, duracao_seg, status, texto, resumo").order("created_at", { ascending: false }).limit(1);
      if (a.id) q = q.eq("id", String(a.id));
      else if (a.titulo) q = q.ilike("titulo", `%${String(a.titulo).replace(/[%_]/g, " ").trim()}%`);
      else throw new Error("Diga o id ou o título da transcrição.");
      const { data, error } = await doUsuario(q, ctx);
      if (error) throw error;
      const t = data?.[0];
      if (!t) throw new Error("Transcrição não encontrada.");
      if (t.status !== "pronta") return { titulo: t.titulo, situacao: t.status, aviso: "Ainda não está pronta." };
      const parte = String(a.parte ?? "ambos");
      const corta = (s: string | null) => (s && s.length > 40_000 ? `${s.slice(0, 40_000)}\n[… texto cortado: abra na aba Transcrição para ver tudo]` : s);
      return {
        titulo: t.titulo,
        data: dataBr(t.created_at),
        duracao: t.duracao_seg ? duracaoLegivel(t.duracao_seg) : null,
        resumo: parte === "texto" ? undefined : corta(t.resumo),
        transcricao: parte === "resumo" ? undefined : corta(t.texto),
        link: "/admin/transcricao",
      };
    },
  },
];

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { configCobranca, destinoDaCobranca, listaDocumentos, preencherMensagem } from "@/lib/cobrancas";
import type { ToolDef } from "./tools";

// Ferramentas do assistente para a cobrança de documento (03/11/2026) e as
// mensagens rápidas do WhatsApp. Tabelas da migration 0065 (fora do types.ts).

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const DESTINO = { type: "string", enum: ["auto", "grupo", "numero"], description: "auto = grupo do cliente, senão o número" };

export function toolsCobranca(dbTipado: () => unknown): ToolDef[] {
  const db = () => dbTipado() as SupabaseClient;

  async function atividade(id: unknown) {
    const { data } = await db().from("activities").select("id, title, status, client_id, clients(name)").eq("id", String(id)).maybeSingle();
    if (!data) throw new Error("Atividade não encontrada.");
    return { id: data.id as string, titulo: data.title as string, status: data.status as string, clienteId: (data.client_id as string | null) || null, cliente: (data.clients as unknown as { name: string } | null)?.name ?? "" };
  }
  const lerDocs = (x: unknown) => [...new Set((Array.isArray(x) ? x : String(x ?? "").split(/[,;\n]/)).map((d) => String(d).trim().slice(0, 120)).filter(Boolean))].slice(0, 20);

  return [
    {
      name: "cobrar_documento_cliente",
      kind: "confirm",
      label: "Ligou a cobrança de documento",
      description:
        "Liga (ou altera) a cobrança automática de documento numa atividade: o portal manda mensagem no WhatsApp do cliente de tempos em tempos (dias úteis, no horário do escritório) até o documento chegar. Sem 'mensagem', usa o texto padrão; sem 'intervalo_dias', o padrão do escritório. A atividade precisa ter cliente (ou informe cliente_id para vincular).",
      parameters: obj(
        {
          atividade_id: { type: "string" },
          documentos: { type: "array", items: { type: "string" }, description: "o que falta (ex.: RG, comprovante de residência)" },
          destino: DESTINO,
          intervalo_dias: { type: "number" },
          mensagem: { type: "string", description: "texto com {cliente}, {titulo} e {documentos}" },
          cliente_id: { type: "string", description: "só se a atividade ainda não tem cliente" },
        },
        ["atividade_id", "documentos"]
      ),
      descrever: async (a) => {
        try {
          const at = await atividade(a.atividade_id);
          const cfg = await configCobranca();
          const clienteId = at.clienteId ?? (a.cliente_id ? String(a.cliente_id) : null);
          const destino = clienteId ? await destinoDaCobranca(clienteId, (a.destino as "auto" | "grupo" | "numero") ?? "auto") : null;
          const docs = lerDocs(a.documentos);
          const texto = preencherMensagem(String(a.mensagem ?? "").trim() || cfg.mensagem, { cliente: at.cliente, titulo: at.titulo, documentos: docs });
          return `Cobrar ${listaDocumentos(docs)} em "${at.titulo}" a cada ${Number(a.intervalo_dias) || cfg.intervaloDias} dia(s) útil(eis), para ${destino?.rotulo ?? "⚠ cliente sem WhatsApp"}:\n“${texto}”`;
        } catch (e) {
          return `⚠ ${(e as Error).message}`;
        }
      },
      run: async (a, ctx) => {
        const at = await atividade(a.atividade_id);
        const cfg = await configCobranca();
        const docs = lerDocs(a.documentos);
        if (!docs.length) throw new Error("Diga quais documentos faltam.");
        let clienteId = at.clienteId;
        if (!clienteId) {
          if (!a.cliente_id) throw new Error("A atividade não tem cliente: informe o cliente para vincular.");
          const { error } = await db().from("activities").update({ client_id: String(a.cliente_id) }).eq("id", at.id);
          if (error) throw error;
          clienteId = String(a.cliente_id);
        }
        const destino = (["auto", "grupo", "numero"].includes(String(a.destino)) ? String(a.destino) : "auto") as "auto" | "grupo" | "numero";
        const rot = await destinoDaCobranca(clienteId, destino);
        if (!rot) throw new Error("O cliente não tem WhatsApp vinculado por esse caminho.");
        const intervalo = Math.min(30, Math.max(1, Math.round(Number(a.intervalo_dias) || cfg.intervaloDias)));
        const campos = { client_id: clienteId, documentos: docs, mensagem: String(a.mensagem ?? "").trim().slice(0, 2000) || cfg.mensagem, destino, intervalo_dias: intervalo, updated_at: new Date().toISOString() };
        const { data: atual } = await db().from("cobrancas_documentos").select("id").eq("activity_id", at.id).maybeSingle();
        const { error } = atual
          ? await db().from("cobrancas_documentos").update(campos).eq("id", atual.id)
          : await db().from("cobrancas_documentos").insert({ ...campos, activity_id: at.id, ativa: true, proxima_em: new Date().toISOString(), criado_por: ctx.profileId });
        if (error) throw error;
        return { ok: true, para: rot.rotulo, intervalo_dias: intervalo, link_no_portal: `/admin/activities/${at.id}` };
      },
    },
    {
      name: "cobrancas_de_documento",
      kind: "read",
      label: "Consultou as cobranças de documento",
      description: "Cobranças de documento (ativas por padrão): atividade, cliente, o que falta, quantas vezes já cobrou e a próxima.",
      parameters: obj({ todas: { type: "boolean", description: "true = inclui pausadas e recebidas" } }),
      run: async (a) => {
        let q = db().from("cobrancas_documentos").select("activity_id, documentos, envios, ultima_em, proxima_em, ativa, recebido_em, activities(title), clients(name)").order("proxima_em");
        if (!a.todas) q = q.eq("ativa", true);
        const { data } = await q.limit(60);
        return (data ?? []).map((c) => ({
          atividade_id: c.activity_id,
          atividade: (c.activities as unknown as { title: string } | null)?.title,
          cliente: (c.clients as unknown as { name: string } | null)?.name,
          documentos: c.documentos,
          cobrancas_enviadas: c.envios,
          ultima: c.ultima_em,
          proxima: c.ativa ? c.proxima_em : null,
          situacao: c.recebido_em ? "recebido" : c.ativa ? "cobrando" : "pausada",
        }));
      },
    },
    {
      name: "documento_recebido",
      kind: "write",
      label: "Marcou documento como recebido",
      description: "Para a cobrança de documento de uma atividade porque o cliente já mandou (ex.: mandou pelo WhatsApp).",
      parameters: obj({ atividade_id: { type: "string" } }, ["atividade_id"]),
      run: async (a, ctx) => {
        const agora = new Date().toISOString();
        const { data, error } = await db().from("cobrancas_documentos").update({ ativa: false, recebido_em: agora, recebido_por: ctx.profileId, updated_at: agora }).eq("activity_id", String(a.atividade_id)).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Essa atividade não tem cobrança de documento.");
        return { ok: true };
      },
    },
    {
      name: "mensagens_rapidas",
      kind: "read",
      perm: ["whatsapp"],
      label: "Consultou as mensagens rápidas",
      description: "Mensagens rápidas do WhatsApp do escritório (atalho e texto). Na conversa, a equipe digita /atalho.",
      parameters: obj({}),
      run: async () => {
        const { data } = await db().from("wa_respostas_rapidas").select("atalho, texto").order("atalho");
        return (data ?? []).map((r) => ({ atalho: `/${r.atalho}`, texto: r.texto }));
      },
    },
    {
      name: "salvar_mensagem_rapida",
      kind: "write",
      perm: ["whatsapp"],
      label: "Salvou mensagem rápida",
      description: "Cria ou troca o texto de uma mensagem rápida do WhatsApp (atalho em minúsculas, sem espaço; {nome} vira o primeiro nome do contato).",
      parameters: obj({ atalho: { type: "string" }, texto: { type: "string" } }, ["atalho", "texto"]),
      run: async (a, ctx) => {
        const atalho = String(a.atalho)
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/^\/+/, "")
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 30);
        const texto = String(a.texto ?? "").trim().slice(0, 4000);
        if (!atalho || !texto) throw new Error("Diga o atalho e o texto.");
        const { error } = await db().from("wa_respostas_rapidas").upsert({ atalho, texto, criado_por: ctx.profileId, updated_at: new Date().toISOString() }, { onConflict: "atalho" });
        if (error) throw error;
        return { ok: true, atalho: `/${atalho}` };
      },
    },
  ];
}

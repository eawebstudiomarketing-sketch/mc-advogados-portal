import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelarAgendamento, criarAgendamento, descreverAgendamento, listarAgendamentos, proximaOcorrencia, recorrenciaValida, resolverConversa, type Recorrencia } from "@/lib/zap/agendamentos";
import type { ToolDef } from "./tools";

// Ferramentas do assistente (04/11/2026): mensagens agendadas no WhatsApp e a
// base de conhecimento do escritório (consulta antes de responder dúvida
// jurídica, de procedimento, preço ou caso).

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const QUANDO = {
  type: "object",
  description:
    "Quando sai: {tipo:'unica', data:'AAAA-MM-DD'} | {tipo:'diaria', uteis?:true} | {tipo:'semanal', dias:[0-6] (0=domingo)} | {tipo:'mensal', dia:1-31}. Nas repetições, 'inicio' (AAAA-MM-DD) opcional.",
  properties: {
    tipo: { type: "string", enum: ["unica", "diaria", "semanal", "mensal"] },
    data: { type: "string" },
    uteis: { type: "boolean" },
    dias: { type: "array", items: { type: "number" } },
    dia: { type: "number" },
    inicio: { type: "string" },
  },
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null);

export function toolsAgendadas(dbTipado: () => unknown): ToolDef[] {
  const db = () => dbTipado() as SupabaseClient;

  async function preparar(a: Record<string, unknown>) {
    const destino = await resolverConversa(String(a.conversa ?? ""));
    if ("erro" in destino) throw new Error(destino.erro);
    const recorrencia = recorrenciaValida(a.quando) as Recorrencia | null;
    if (!recorrencia) throw new Error("Diga quando a mensagem sai (uma vez numa data, todo dia, toda semana em quais dias, ou todo mês em que dia).");
    const hora = String(a.hora ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(hora)) throw new Error("Diga o horário (HH:MM, horário da Bahia).");
    const texto = String(a.texto ?? "").trim();
    if (!texto) throw new Error("Diga o texto da mensagem.");
    const ate = typeof a.ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.ate) ? a.ate : null;
    return { destino, recorrencia, hora, texto, ate };
  }

  return [
    {
      name: "agendar_mensagem_zap",
      kind: "confirm",
      perm: ["whatsapp"],
      label: "Agendou mensagem no WhatsApp",
      description:
        "Agenda uma mensagem automática no WhatsApp do escritório para uma conversa (nome do grupo/contato, nome do cliente ou telefone): uma vez numa data, todo dia, todo dia útil, toda semana em dias escolhidos ou todo mês num dia. Horário da Bahia. Pede confirmação.",
      parameters: obj({ conversa: { type: "string" }, texto: { type: "string" }, quando: QUANDO, hora: { type: "string", description: "HH:MM" }, ate: { type: "string", description: "repetir até AAAA-MM-DD (opcional)" } }, ["conversa", "texto", "quando", "hora"]),
      descrever: async (a) => {
        try {
          const p = await preparar(a);
          const prox = proximaOcorrencia(p.recorrencia, p.hora, new Date(), p.ate);
          return `${descreverAgendamento(p.recorrencia, p.hora)}${p.ate ? `, até ${p.ate.split("-").reverse().join("/")}` : ""} para ${p.destino.rotulo}${prox ? ` (a 1ª sai ${fmt(prox.toISOString())})` : " ⚠ esse horário já passou"}:\n“${p.texto}”`;
        } catch (e) {
          return `⚠ ${(e as Error).message}`;
        }
      },
      run: async (a, ctx) => {
        const p = await preparar(a);
        const ag = await criarAgendamento({ para: p.destino.para, rotulo: p.destino.rotulo, texto: p.texto, recorrencia: p.recorrencia, hora: p.hora, ate: p.ate, criadoPor: ctx.profileId });
        return { agendada: ag.id, para: p.destino.rotulo, quando: descreverAgendamento(ag.recorrencia, ag.hora), primeira: fmt(ag.proxima_em) };
      },
    },
    {
      name: "mensagens_agendadas",
      kind: "read",
      perm: ["whatsapp"],
      label: "Consultou as mensagens agendadas",
      description: "Mensagens agendadas no WhatsApp (ativas por padrão): para quem, quando repete, a próxima e quantas vezes já saiu.",
      parameters: obj({ todas: { type: "boolean", description: "true = inclui as canceladas/terminadas" } }),
      run: async (a) =>
        (await listarAgendamentos({ todos: !!a.todas })).map((x) => ({
          id: x.id,
          para: x.rotulo,
          quando: descreverAgendamento(x.recorrencia, x.hora) + (x.ate ? `, até ${x.ate}` : ""),
          proxima: fmt(x.proxima_em),
          ja_saiu: x.envios,
          ativa: x.ativo,
          texto: x.texto.slice(0, 300),
        })),
    },
    {
      name: "cancelar_mensagem_agendada",
      kind: "delete",
      perm: ["whatsapp"],
      label: "Cancelou mensagem agendada",
      description: "Cancela uma mensagem agendada (para de repetir e tira da fila o envio que estava marcado). Pegue o id em mensagens_agendadas.",
      parameters: obj({ id: { type: "string" } }, ["id"]),
      run: async (a) => {
        await cancelarAgendamento(String(a.id));
        return { cancelada: true };
      },
    },
    {
      name: "base_de_conhecimento",
      kind: "read",
      label: "Consultou a base de conhecimento",
      description:
        "Base de conhecimento do MC Advogados (como o escritório trabalha, teses e regras por área: marcas/PI, consumidor/bancário, trabalhista, previdenciário, tributário, empresarial/contratos, família, sucessões; tom de comunicação, preços, propostas, casos-modelo, legislação mais usada). CONSULTE ANTES de responder dúvida jurídica, de procedimento, de preço ou sobre um caso. Sem 'termo', lista os temas. O que vier daqui é do escritório; o que você souber por conta própria, diga que é conhecimento geral.",
      parameters: obj({ termo: { type: "string", description: "assunto, tese, lei, cliente ou caso" }, area: { type: "string" } }),
      run: async (a) => {
        const termo = String(a.termo ?? "").replace(/[,()%*\\]/g, " ").trim();
        if (!termo && !a.area) {
          const { data } = await db().from("base_conhecimento").select("area, titulo").order("area").order("ordem");
          return { temas: data ?? [] };
        }
        let q = db().from("base_conhecimento").select("area, titulo, conteudo").order("ordem").limit(6);
        if (a.area) q = q.ilike("area", `%${String(a.area).replace(/[,()%*\\]/g, " ").trim()}%`);
        if (termo) {
          const palavras = termo.split(/\s+/).filter((p) => p.length >= 3).slice(0, 4);
          q = q.or((palavras.length ? palavras : [termo]).flatMap((p) => [`titulo.ilike.%${p}%`, `conteudo.ilike.%${p}%`]).join(","));
        }
        const { data } = await q;
        return (data ?? []).map((s) => ({ area: s.area, titulo: s.titulo, conteudo: String(s.conteudo).slice(0, 6000) }));
      },
    },
    {
      name: "salvar_conhecimento",
      kind: "write",
      soAdmin: true,
      label: "Atualizou a base de conhecimento",
      description: "Cria ou troca uma seção da base de conhecimento do escritório (área + título). Use quando o Maurício pedir para guardar uma regra, tese ou procedimento.",
      parameters: obj({ area: { type: "string" }, titulo: { type: "string" }, conteudo: { type: "string" } }, ["area", "titulo", "conteudo"]),
      run: async (a) => {
        const area = String(a.area).trim().slice(0, 80);
        const titulo = String(a.titulo).trim().slice(0, 200);
        const conteudo = String(a.conteudo).trim().slice(0, 20000);
        if (!area || !titulo || !conteudo) throw new Error("Diga a área, o título e o conteúdo.");
        const { data: atual } = await db().from("base_conhecimento").select("id").eq("area", area).eq("titulo", titulo).maybeSingle();
        const { error } = atual
          ? await db().from("base_conhecimento").update({ conteudo, updated_at: new Date().toISOString() }).eq("id", atual.id)
          : await db().from("base_conhecimento").insert({ area, titulo, conteudo, ordem: 999 });
        if (error) throw error;
        return { ok: true, area, titulo };
      },
    },
  ];
}

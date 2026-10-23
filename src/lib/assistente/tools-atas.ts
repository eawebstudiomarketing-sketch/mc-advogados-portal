import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { aprovarEEnviar, extrasDoRegistro, localLegivel, reenviarLink, telefoneZap, type AssinaturaRow } from "@/lib/atas/assinatura";
import { dataHoraBr, STATUS_ROTULO, TIPOS_ATA, textoCompleto, type Participante, type StatusAta, type TipoAta } from "@/lib/atas/formato";
import type { Ctx, ToolDef } from "./tools";

// Atas (gerador de atas): o assistente lista, lê, diz quem falta assinar,
// reenvia o link e aprova (os dois últimos pedem confirmação na tela).
// A gravação em si é só pela tela (precisa do navegador).

const db = () => createAdminClient() as unknown as SupabaseClient;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const link = (id: string) => `/admin/atas/${id}`;

type AtaLinha = {
  id: string;
  titulo: string;
  tipo: TipoAta;
  status: StatusAta;
  data_reuniao: string;
  local: string | null;
  pauta: string | null;
  versao: number;
  texto: string | null;
  participantes: Participante[];
  profile_id: string;
  clients: { name: string } | null;
};

/** Admin vê todas; advogado só as dele. */
async function acharAta(a: Record<string, unknown>, ctx: Ctx): Promise<AtaLinha> {
  let q = db().from("atas").select("*, clients(name)").order("data_reuniao", { ascending: false }).limit(1);
  if (ctx.role !== "admin") q = q.eq("profile_id", ctx.profileId);
  if (a.id) q = q.eq("id", String(a.id));
  else if (a.cliente) {
    const { data: cs } = await db().from("clients").select("id").ilike("name", `%${String(a.cliente).replace(/[%_,()]/g, " ").trim()}%`).limit(10);
    if (!cs?.length) throw new Error(`Não achei o cliente "${a.cliente}".`);
    q = q.in("client_id", cs.map((c) => c.id));
  } else if (a.titulo) q = q.ilike("titulo", `%${String(a.titulo).replace(/[%_]/g, " ").trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.[0]) throw new Error("Ata não encontrada.");
  return data[0] as AtaLinha;
}

export const TOOLS_ATAS: ToolDef[] = [
  {
    name: "listar_atas",
    kind: "read",
    perm: ["atas"],
    label: "Consultou as atas",
    description: "Lista as atas de reunião do gerador de atas (título, cliente, data, tipo, situação: rascunho, aguardando assinaturas, assinada…), mais recentes primeiro. Filtros opcionais: cliente (nome) e situacao.",
    parameters: obj({ cliente: { type: "string" }, situacao: { type: "string", enum: Object.keys(STATUS_ROTULO) }, limite: { type: "integer" } }),
    run: async (a, ctx) => {
      let q = db()
        .from("atas")
        .select("id, titulo, tipo, status, data_reuniao, versao, clients(name), ata_assinaturas(status, versao)")
        .order("data_reuniao", { ascending: false })
        .limit(Math.min(Number(a.limite) || 20, 50));
      if (ctx.role !== "admin") q = q.eq("profile_id", ctx.profileId);
      if (a.situacao) q = q.eq("status", String(a.situacao));
      if (a.cliente) {
        const { data: cs } = await db().from("clients").select("id").ilike("name", `%${String(a.cliente).replace(/[%_,()]/g, " ").trim()}%`).limit(10);
        if (!cs?.length) return [];
        q = q.in("client_id", cs.map((c) => c.id));
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t) => {
        const atuais = ((t.ata_assinaturas ?? []) as { status: string; versao: number }[]).filter((s) => s.versao === t.versao && s.status !== "cancelada");
        return {
          id: t.id,
          titulo: t.titulo,
          cliente: (t.clients as unknown as { name: string } | null)?.name ?? null,
          data: dataHoraBr(t.data_reuniao),
          tipo: TIPOS_ATA[t.tipo as TipoAta].rotulo,
          situacao: STATUS_ROTULO[t.status as StatusAta],
          assinaturas: atuais.length ? `${atuais.filter((s) => s.status === "assinada").length} de ${atuais.length}` : null,
          link: link(t.id),
        };
      });
    },
  },
  {
    name: "ler_ata",
    kind: "read",
    perm: ["atas"],
    label: "Leu uma ata",
    description: "Lê o texto de uma ata (pelo id, cliente ou parte do título; sem filtro, a mais recente). Use para responder sobre o que foi decidido/combinado numa reunião.",
    parameters: obj({ id: { type: "string" }, cliente: { type: "string" }, titulo: { type: "string" } }),
    run: async (a, ctx) => {
      const t = await acharAta(a, ctx);
      const texto = textoCompleto({ ...t, cliente: t.clients?.name ?? null }, t.texto);
      return { id: t.id, situacao: STATUS_ROTULO[t.status], texto: texto.length > 40_000 ? `${texto.slice(0, 40_000)}\n[… cortado: abra a ata]` : texto, link: link(t.id) };
    },
  },
  {
    name: "assinaturas_da_ata",
    kind: "read",
    perm: ["atas"],
    label: "Viu as assinaturas da ata",
    description: "Mostra quem já assinou e quem falta assinar uma ata (pelo id, cliente ou título): data, por onde confirmou, local, selfie/documento (com a conferência da IA), certificado digital, observadores, recusas. Devolve o assinatura_id de cada pessoa (para reenviar_link_ata).",
    parameters: obj({ id: { type: "string" }, cliente: { type: "string" }, titulo: { type: "string" } }),
    run: async (a, ctx) => {
      const t = await acharAta(a, ctx);
      const { data } = await db().from("ata_assinaturas").select("*").eq("ata_id", t.id).eq("versao", t.versao).neq("status", "cancelada").order("ordem").order("created_at");
      return {
        ata: t.titulo,
        cliente: t.clients?.name ?? null,
        situacao: STATUS_ROTULO[t.status],
        pessoas: ((data ?? []) as AssinaturaRow[]).map((s) => ({
          assinatura_id: s.id,
          nome: s.nome,
          observador: s.observador || undefined,
          situacao: s.observador
            ? "só acompanha"
            : s.status === "assinada"
              ? `assinou em ${dataHoraBr(s.assinado_em!)}`
              : s.status === "correcao"
                ? `pediu correção: ${s.correcao}`
                : s.status === "recusada"
                  ? `recusou: ${s.recusa}`
                  : `falta assinar (link ${s.enviado_em ? `enviado ${dataHoraBr(s.enviado_em)}` : "ainda não enviado: ordem de assinatura"}, ${s.lembretes} lembrete(s))`,
          detalhes: s.status === "assinada" ? [...extrasDoRegistro(s), localLegivel(s.local)].filter(Boolean) : undefined,
        })),
        link: link(t.id),
      };
    },
  },
  {
    name: "reenviar_link_ata",
    kind: "confirm",
    perm: ["atas"],
    label: "Reenviou o link de assinatura",
    description: "Manda um link novo de assinatura da ata para uma pessoa que ainda não assinou (o link antigo para de funcionar). Pegue o assinatura_id em assinaturas_da_ata.",
    parameters: obj({ assinatura_id: { type: "string" } }, ["assinatura_id"]),
    descrever: async (a) => {
      const { data } = await db().from("ata_assinaturas").select("nome, telefone, email").eq("id", String(a.assinatura_id)).maybeSingle();
      return data ? `Reenviar o link de assinatura para ${data.nome} (${[data.telefone ? "WhatsApp" : "", data.email ? "e-mail" : ""].filter(Boolean).join(" e ")})?` : "Reenviar o link de assinatura?";
    },
    run: async (a, ctx) => {
      const { data: s } = await db().from("ata_assinaturas").select("ata_id").eq("id", String(a.assinatura_id)).maybeSingle();
      if (!s) throw new Error("Assinatura não encontrada.");
      if (ctx.role !== "admin") {
        const { data: dona } = await db().from("atas").select("id").eq("id", s.ata_id).eq("profile_id", ctx.profileId).maybeSingle();
        if (!dona) throw new Error("Essa ata não é sua.");
      }
      const via = await reenviarLink(String(a.assinatura_id));
      return { ok: true, enviado_por: via };
    },
  },
  {
    name: "aprovar_ata",
    kind: "confirm",
    perm: ["atas"],
    label: "Aprovou a ata",
    description:
      "Aprova uma ata em rascunho: quem pediu assina pelo escritório e o link de assinatura vai para os participantes de fora que têm WhatsApp ou e-mail. Depois disso o texto fica travado. Só use quando a pessoa pedir para aprovar/enviar.",
    parameters: obj({ id: { type: "string" }, cliente: { type: "string" }, titulo: { type: "string" } }),
    descrever: async (a) => {
      const { data } = await db().from("atas").select("titulo, participantes, tipo").eq("id", String(a.id ?? "")).maybeSingle();
      if (!data) return "Aprovar a ata e enviar para assinatura?";
      const fora = ((data.participantes ?? []) as Participante[]).filter((p) => p.papel !== "escritorio" && (telefoneZap(p.telefone) || p.email));
      return `Aprovar "${data.titulo}"${TIPOS_ATA[data.tipo as TipoAta].assinaCliente && fora.length ? ` e mandar o link de assinatura para ${fora.map((p) => p.nome).join(", ")}` : ""}?`;
    },
    run: async (a, ctx) => {
      const t = await acharAta(a, ctx);
      if (t.status !== "rascunho") throw new Error(`Essa ata está "${STATUS_ROTULO[t.status]}", não em rascunho.`);
      const { data: eu } = await db().from("profiles").select("full_name").eq("id", ctx.profileId).single();
      const fora = (t.participantes ?? []).filter((p) => p.papel !== "escritorio" && (telefoneZap(p.telefone) || p.email));
      const r = await aprovarEEnviar(t.id, { profileId: ctx.profileId, nome: eu?.full_name ?? "Escritório", ip: null, ua: "Assistente do portal" }, fora);
      return { ok: true, enviados: r.enviados, link: link(t.id) };
    },
  },
];

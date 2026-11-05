import "server-only";
import { decidirPedidoPrazo, listarPedidosPrazo, pedirMudancaPrazo, dataBr } from "@/lib/prazo-pedidos";
import type { ToolDef } from "./tools";

// Prazo travado (05/11/2026): a equipe pede a mudança de prazo com justificativa;
// o admin máximo (Maurício) aprova ou recusa.

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export function toolsPrazo(nomeDe: (profileId: string) => Promise<string>): ToolDef[] {
  return [
    {
      name: "pedir_mudanca_prazo",
      kind: "confirm",
      label: "Pediu mudança de prazo",
      description:
        "Pede ao Dr. Maurício para mudar o prazo de uma atividade que JÁ tem prazo (a equipe não pode mudar sozinha). Precisa da nova data (ou '' para tirar o prazo) e da justificativa. Ele aprova ou recusa; a resposta chega no WhatsApp.",
      parameters: obj({ activity_id: { type: "string" }, novo_prazo: { type: "string", description: "AAAA-MM-DD ou '' para tirar" }, justificativa: { type: "string" } }, ["activity_id", "novo_prazo", "justificativa"]),
      resumo: (a) => `Pedir ao Dr. Maurício: prazo → ${dataBr(a.novo_prazo ? String(a.novo_prazo) : null)}\nJustificativa: ${String(a.justificativa ?? "")}`,
      run: async (a, ctx) => {
        const r = await pedirMudancaPrazo({ profileId: ctx.profileId, nome: await nomeDe(ctx.profileId), activityId: String(a.activity_id), prazoNovo: a.novo_prazo ? String(a.novo_prazo) : null, justificativa: String(a.justificativa ?? "") });
        if (!r.ok) throw new Error(r.error);
        return { ok: true, aviso: "Pedido enviado ao Dr. Maurício." };
      },
    },
    {
      name: "pedidos_de_prazo",
      kind: "read",
      soSuper: true,
      label: "Viu pedidos de prazo",
      description: "Pedidos da equipe para mudar prazo de atividade aguardando decisão (ou os já decididos).",
      parameters: obj({ decididos: { type: "boolean" } }),
      run: async (a) =>
        (await listarPedidosPrazo(a.decididos ? "decididos" : "pendente", 30)).map((p) => ({
          pedido_id: p.id,
          atividade: p.atividade,
          cliente: p.cliente,
          quem: p.quem,
          de: dataBr(p.prazo_atual),
          para: dataBr(p.prazo_novo),
          justificativa: p.justificativa,
          status: p.status,
          link_no_portal: "/admin/alertas?aba=prazos",
        })),
    },
    {
      name: "decidir_pedido_prazo",
      kind: "confirm",
      soSuper: true,
      label: "Decidiu pedido de prazo",
      description: "Aprova (muda o prazo) ou recusa um pedido de mudança de prazo. Resposta opcional vai para a pessoa no WhatsApp.",
      parameters: obj({ pedido_id: { type: "string" }, aprovar: { type: "boolean" }, resposta: { type: "string" } }, ["pedido_id", "aprovar"]),
      resumo: (a) => `${a.aprovar ? "Aprovar" : "Recusar"} o pedido de prazo${a.resposta ? `\nResposta: ${String(a.resposta)}` : ""}`,
      run: async (a, ctx) => {
        const r = await decidirPedidoPrazo({ decididoPor: ctx.profileId, pedidoId: String(a.pedido_id), aprovar: !!a.aprovar, resposta: a.resposta ? String(a.resposta) : null });
        if (!r.ok) throw new Error(r.error);
        return { ok: true };
      },
    },
  ];
}

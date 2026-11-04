"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { destinoDoCliente } from "@/lib/zap/fila";

// Mensagem automática no WhatsApp criada junto com a atividade (04/11/2026):
// a pessoa escreve ou pede para a IA montar, e escolhe quando sai.

/** Por onde a mensagem do cliente sairia (para mostrar no formulário antes de criar). */
export async function destinoZapDoClienteAction(clientId: string): Promise<string | null> {
  await requireRole(["admin", "advogado"]);
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  return (await destinoDoCliente(clientId))?.rotulo ?? null;
}

/** Texto da mensagem escrito pela IA (modelo mais barato, entrada enxuta). */
export async function gerarMensagemAtividadeAction(v: {
  clientId: string;
  titulo: string;
  descricao?: string;
  tipo?: string;
  data?: string;
  hora?: string;
  pedido?: string;
}): Promise<{ ok: boolean; erro?: string; mensagem?: string }> {
  await requireRole(["admin", "advogado"]);
  if (!v.titulo.trim()) return { ok: false, erro: "Escreva o título da atividade primeiro." };
  const { data: cli } = /^[0-9a-f-]{36}$/i.test(v.clientId)
    ? await (await createClient()).from("clients").select("name, tipo_pessoa").eq("id", v.clientId).maybeSingle()
    : { data: null };
  const nome = cli ? (cli.tipo_pessoa === "PF" ? cli.name.trim().split(/\s+/)[0] : cli.name.trim()) : "";
  const quando = v.data ? `${v.data.split("-").reverse().join("/")}${v.hora ? ` às ${v.hora}` : ""}` : "";
  const r = await generateJson<{ mensagem: string }>({
    model: MODELOS.onboarding,
    funcao: "mensagem_atividade",
    system:
      "Você escreve mensagens de WhatsApp de um escritório de advocacia (MC Advogados) para o cliente, sobre uma atividade do escritório. Tom cordial e direto, português do Brasil, sem juridiquês, 2 a 4 frases, no máximo 1 emoji. " +
      "Escreva em primeira pessoa do escritório. Não invente prazos, valores, datas ou fatos que não estejam no pedido. Se for audiência, lembre data, horário e peça para chegar com antecedência e com documento com foto.",
    parts: [
      {
        text: [
          nome && `Cliente: ${nome}`,
          `Atividade: ${v.titulo.slice(0, 200)}`,
          v.tipo && `Tipo: ${v.tipo}`,
          v.descricao?.trim() && `Detalhes: ${v.descricao.trim().slice(0, 600)}`,
          quando && `Data/horário da atividade: ${quando}`,
          v.pedido?.trim() && `O que a mensagem deve dizer: ${v.pedido.trim().slice(0, 300)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    schema: { type: "object", properties: { mensagem: { type: "string" } }, required: ["mensagem"] },
  });
  return r.ok ? { ok: true, mensagem: r.data.mensagem.trim() } : { ok: false, erro: r.error };
}

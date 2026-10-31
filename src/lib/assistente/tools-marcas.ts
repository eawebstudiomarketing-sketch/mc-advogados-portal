import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDef } from "./tools";
import { listMarcasZap, listModelos, modeloPara, montarMensagem, statusDaMensagem, enviarMarca } from "@/lib/marcas/zap";

// Ferramentas do assistente para o módulo Marcas (INPI), 30/10/2026: carteira,
// ficha, prazos administrativos e o informativo do WhatsApp por status.

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);

export function toolsMarcas(db: () => unknown): ToolDef[] {
  const banco = () => db() as SupabaseClient; // tabelas da 0061 fora dos tipos gerados
  return [
    {
      name: "marcas_carteira",
      kind: "read",
      perm: ["marcas"],
      label: "Consultou as marcas no INPI",
      description: "Marcas acompanhadas no INPI (aba Marcas): nome, processo, situação, último despacho e cliente. Filtre por termo (marca, processo, titular ou cliente) ou situação.",
      parameters: obj({ termo: { type: "string" }, situacao: { type: "string" } }),
      run: async (a) => {
        let q = banco().from("marcas").select("processo, nome, apelido, situacao, ultimo_despacho, ultimo_despacho_data, titular, contato_nome, clients(name)").eq("acompanhando", true).limit(200);
        const t = String(a.termo ?? "").trim().replace(/[,()%*\\]/g, " ");
        if (t) q = q.or(`nome.ilike.%${t}%,processo.ilike.%${t}%,titular.ilike.%${t}%,contato_nome.ilike.%${t}%`);
        if (a.situacao) q = q.ilike("situacao", `%${String(a.situacao)}%`);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return { total: data?.length ?? 0, tela: "/admin/marcas/processos", marcas: (data ?? []).map((m) => ({ ...m, ultimo_despacho_data: dataBR(m.ultimo_despacho_data) })) };
      },
    },
    {
      name: "marca_ficha",
      kind: "read",
      perm: ["marcas"],
      label: "Abriu a ficha da marca",
      description: "Ficha de uma marca pelo número do processo INPI (9 dígitos): dados, histórico de publicações na RPI e prazos administrativos.",
      parameters: obj({ processo: { type: "string" } }, ["processo"]),
      run: async (a) => {
        const p = String(a.processo ?? "").replace(/\D/g, "");
        const { data: m } = await banco().from("marcas").select("*").eq("processo", p).maybeSingle();
        if (!m) throw new Error(`O processo ${p} não está na carteira.`);
        const [{ data: pubs }, { data: prazos }] = await Promise.all([
          banco().from("marca_publicacoes").select("rpi, data, codigo, despacho, info").eq("marca_id", m.id).order("rpi"),
          banco().from("marca_prazos").select("acao, vence_em, situacao").eq("marca_id", m.id).order("vence_em"),
        ]);
        delete m.imagem;
        return { marca: m, publicacoes: pubs, prazos, tela: `/admin/marcas/processos/${p}` };
      },
    },
    {
      name: "marcas_prazos",
      kind: "read",
      perm: ["marcas"],
      label: "Consultou os prazos das marcas",
      description: "Prazos administrativos do INPI em aberto (recurso, oposição, exigência, decênio...), do mais perto para o mais longe.",
      parameters: obj({}),
      run: async () => {
        const { data } = await banco().from("marca_prazos").select("acao, vence_em, situacao, marcas!inner(processo, nome, acompanhando)").eq("situacao", "pendente").eq("marcas.acompanhando", true).order("vence_em").limit(100);
        return { tela: "/admin/marcas#prazos", prazos: (data ?? []).map((p) => ({ ...p, vence_em: dataBR(p.vence_em) })) };
      },
    },
    {
      name: "marcas_enviar_zap",
      kind: "confirm",
      perm: ["marcas"],
      label: "Mandou o informativo da marca no WhatsApp",
      description: "Manda no WhatsApp do cliente a mensagem da marca, pelo modelo do status (aba Marcas → WhatsApp). Informe os processos; sem texto, usa o modelo.",
      parameters: obj({ processos: { type: "array", items: { type: "string" } }, texto: { type: "string", description: "Opcional: texto pronto (vale para todos)" } }, ["processos"]),
      resumo: (a) => `Mandar o informativo de ${((a.processos as string[]) ?? []).length} marca(s) no WhatsApp`,
      run: async (a, ctx) => {
        const alvo = new Set(((a.processos as string[]) ?? []).map((p) => String(p).replace(/\D/g, "")));
        const [marcas, modelos] = await Promise.all([listMarcasZap(), listModelos()]);
        let enviados = 0;
        const erros: string[] = [];
        for (const m of marcas.filter((x) => alvo.has(x.processo))) {
          const modelo = modeloPara(statusDaMensagem(m), modelos);
          const texto = String(a.texto ?? "").trim() || (modelo ? montarMensagem(m, modelo.texto) : "");
          if (!texto) {
            erros.push(`${m.processo}: sem modelo`);
            continue;
          }
          const r = await enviarMarca(m, texto, ctx.profileId);
          if (r.ok) enviados++;
          else erros.push(r.error);
        }
        return { enviados, erros };
      },
    },
  ];
}

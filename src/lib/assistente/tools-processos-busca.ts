import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { djenPorNome, djenPorOab, mascaraCnj } from "@/lib/processos-busca/fontes";
import { abrirCandidato, aprovarCandidato, descartarCandidato, getCandidato, listarCandidatosAbertos, type Candidato } from "@/lib/processos-busca/candidatos";
import type { ToolDef } from "./tools";

// Novo processo por pesquisa (30/10/2026): o Assistente pesquisa, mostra a prévia e, com
// confirmação, aprova (o processo entra com todo o histórico) ou descarta. Mesma regra da tela
// /admin/processes/new.

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

const previa = (c: Candidato) => {
  const movs = [...(c.leitura?.movs ?? [])].sort((a, b) => b.data.localeCompare(a.data));
  return {
    candidato_id: c.id,
    numero: c.numero_processo,
    situacao: c.status === "lendo" ? "robô lendo no tribunal (de 5 s a 1 min; pergunte de novo)" : c.status === "pronto" ? "lido no tribunal, aguardando aprovação" : c.status === "erro" ? `não deu para ler no tribunal: ${c.leitura?.erro ?? "sem resposta"}` : c.status,
    origem: c.origem === "djen" ? "achado no diário oficial" : "pesquisado pela equipe",
    tribunal: [c.resumo?.tribunal, c.resumo?.grau].filter(Boolean).join(" · ") || null,
    orgao: c.resumo?.orgao ?? null,
    classe: c.resumo?.classe ?? null,
    assuntos: c.resumo?.assuntos ?? [],
    distribuido_em: c.resumo?.ajuizamento?.slice(0, 10) ?? null,
    partes: (c.resumo?.partes ?? []).map((p) => `${p.nome} (${p.polo ?? "parte"})`),
    andamentos: movs.length,
    ultimos_andamentos: movs.slice(0, 5).map((m) => `${m.data.slice(0, 10)} · ${m.texto.slice(0, 160)}`),
  };
};

export const TOOLS_PROCESSOS_BUSCA: ToolDef[] = [
  {
    name: "pesquisar_processo_novo",
    kind: "read",
    perm: ["processos"],
    label: "Pesquisou um processo para incluir",
    description:
      "Pesquisa um processo que ainda NÃO está no portal, para incluir. Pelo número CNJ: põe o robô para ler no tribunal e devolve a prévia (partes, órgão, classe, andamentos) com o candidato_id para aprovar. Por nome da parte ou OAB: lista os processos com publicação no diário oficial (DJEN), dizendo quais já estão no portal. Se o processo já existe, devolve o link dele.",
    parameters: obj({
      numero: { type: "string", description: "número CNJ (20 dígitos)" },
      nome: { type: "string", description: "nome completo da parte" },
      oab: { type: "string", description: "número da OAB" },
      uf: { type: "string", description: "UF da OAB (ex.: BA)" },
    }),
    run: async (a, ctx) => {
      if (a.numero) {
        if (!mascaraCnj(String(a.numero))) throw new Error("Número CNJ inválido (precisa de 20 dígitos).");
        const r = await abrirCandidato(String(a.numero), "busca", ctx.profileId);
        if ("jaNoPortal" in r) return { ja_no_portal: true, link: `/admin/processes/${r.jaNoPortal}` };
        return { ...previa(r.candidato), tela: "/admin/processes/new" };
      }
      const itens = a.nome ? await djenPorNome(String(a.nome)) : a.oab ? await djenPorOab(String(a.oab), String(a.uf ?? "BA")) : null;
      if (!itens) throw new Error("Informe o número, o nome da parte ou a OAB.");
      const dig = itens.map((i) => i.digitos);
      const { data: procs } = await createAdminClient().from("processes").select("id, numero_digitos").in("numero_digitos", dig);
      const ja = new Map((procs ?? []).map((p) => [p.numero_digitos as string, p.id as string]));
      return {
        total: itens.length,
        processos: itens.slice(0, 40).map((i) => ({
          numero: i.numero,
          tribunal: i.tribunal,
          orgao: i.orgao,
          classe: i.classe,
          partes: i.partes.slice(0, 4).map((p) => p.nome),
          ultima_publicacao: i.ultimaPublicacao,
          no_portal: ja.has(i.digitos) ? `/admin/processes/${ja.get(i.digitos)}` : null,
        })),
        dica: "Para incluir um deles, pesquise pelo número (pesquisar_processo_novo com numero).",
      };
    },
  },
  {
    name: "processos_aguardando_aprovacao",
    kind: "read",
    perm: ["processos"],
    label: "Viu os processos aguardando aprovação",
    description: "Lista os processos pesquisados ou achados no diário oficial que aguardam aprovação para entrar no portal, com a prévia de cada um. Também serve para ver se o robô já terminou de ler um candidato.",
    parameters: obj({ candidato_id: { type: "string", description: "opcional: só este candidato" } }),
    run: async (a) => {
      if (a.candidato_id) {
        const c = await getCandidato(String(a.candidato_id));
        if (!c) throw new Error("Candidato não encontrado.");
        return previa(c);
      }
      const lista = await listarCandidatosAbertos();
      return { total: lista.length, tela: "/admin/processes/new", candidatos: lista.slice(0, 30).map(previa) };
    },
  },
  {
    name: "aprovar_processo_novo",
    kind: "confirm",
    perm: ["processos"],
    label: "Aprovou a inclusão de um processo",
    description:
      "Aprova um candidato (candidato_id de pesquisar_processo_novo ou processos_aguardando_aprovacao): o processo entra no portal com todo o histórico de andamentos (sem gerar avisos) e passa a ser acompanhado. Cliente é opcional (client_id). Pede confirmação.",
    parameters: obj({ candidato_id: { type: "string" }, client_id: { type: "string", description: "opcional: id do cliente" } }, ["candidato_id"]),
    descrever: async (a) => {
      const c = await getCandidato(String(a.candidato_id));
      return c ? `Incluir no portal o processo ${c.numero_processo}${c.resumo?.classe ? ` (${c.resumo.classe})` : ""} com ${c.leitura?.movs?.length ?? 0} andamento(s) no histórico` : "Incluir o processo";
    },
    run: async (a, ctx) => {
      const r = await aprovarCandidato(String(a.candidato_id), { clientId: a.client_id ? String(a.client_id) : null, area: null, responsibleId: ctx.profileId }, ctx.profileId);
      return { incluido: true, link: `/admin/processes/${r.processId}`, andamentos_no_historico: r.andamentos, robo_ainda_lendo: r.lendo };
    },
  },
  {
    name: "descartar_processo_novo",
    kind: "confirm",
    perm: ["processos"],
    label: "Descartou um processo da aprovação",
    description: "Descarta um candidato aguardando aprovação: ele não entra no portal. Pede confirmação.",
    parameters: obj({ candidato_id: { type: "string" } }, ["candidato_id"]),
    descrever: async (a) => {
      const c = await getCandidato(String(a.candidato_id));
      return `Descartar o processo ${c?.numero_processo ?? ""} (não entra no portal)`;
    },
    run: async (a, ctx) => {
      await descartarCandidato(String(a.candidato_id), ctx.profileId);
      return { descartado: true };
    },
  },
];

import "server-only";
import { calcularMetricas, periodoDe } from "@/lib/painel/metricas";
import { gerenteEmTexto, relatorioDoGerente } from "@/lib/painel/gerente";
import type { ToolDef } from "./tools";

// Painel do Dono (só admin máximo): o assistente lê os mesmos números da tela
// /admin/painel e as sugestões do dia (já guardadas — não gasta IA de novo).

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const PERIODOS = ["hoje", "7d", "mes", "30d", "mes-anterior", "ano"];
const SECOES = ["resumo", "atividades", "distribuicao", "atendimento", "satisfacao", "equipe", "clientes", "financeiro", "sistema", "auditoria"];

export const TOOLS_PAINEL: ToolDef[] = [
  {
    name: "painel_do_dono",
    kind: "read",
    soSuper: true,
    label: "Consultou o Painel do Dono",
    description:
      "Números de gestão do escritório (Painel do Dono): saúde 0–100, atividades criadas × concluídas, % no prazo, tempo médio, paradas há mais tempo, Distribuição (chegou/aceita/descartada), tempo de resposta no WhatsApp e quem respondeu, satisfação automática dos clientes (pelo tempo de atendimento), ranking da equipe, clientes que mais demandam / pouco ativos / esfriando, financeiro, robôs e auditoria (quem fez o quê). periodo: hoje | 7d | mes (padrão) | 30d | mes-anterior | ano. secao: uma das seções ou 'resumo'.",
    parameters: obj({ periodo: { type: "string", enum: PERIODOS }, secao: { type: "string", enum: SECOES } }),
    run: async (a) => {
      const m = await calcularMetricas(periodoDe(PERIODOS.includes(String(a.periodo)) ? String(a.periodo) : "mes"));
      const s = String(a.secao ?? "resumo");
      const base = { periodo: m.periodo.rotulo, link_no_portal: `/admin/painel?p=${m.periodo.id}` };
      const { serie: _serie, ...atividades } = m.atividades;
      void _serie;
      switch (s) {
        case "atividades":
          return { ...base, ...atividades };
        case "distribuicao":
          return { ...base, ...m.distribuicao };
        case "atendimento":
          return { ...base, ...m.atendimento, porHora: undefined };
        case "satisfacao":
          return { ...base, ...m.satisfacao };
        case "equipe":
          return { ...base, equipe: m.equipe };
        case "clientes":
          return { ...base, ...m.clientes };
        case "financeiro":
          return { ...base, ...m.financas, ...m.comercial };
        case "sistema":
          return { ...base, saude: m.saude, componentes: m.componentes, ...m.sistema };
        case "auditoria":
          return { ...base, ultimas_acoes: m.auditoria.slice(0, 25) };
        default:
          return {
            ...base,
            saude: m.saude,
            atividades: { criadas: atividades.criadas, concluidas: atividades.concluidas, abertas: atividades.abertas, atrasadas: atividades.atrasadas, noPrazoPct: atividades.noPrazoPct, tempoMedioDias: atividades.tempoMedioDias },
            distribuicao: { chegaram: m.distribuicao.chegaram, aceitas: m.distribuicao.aceitas, descartadas: m.distribuicao.descartadas, pendentesAgora: m.distribuicao.pendentesAgora },
            whatsapp: { respostaMedianaHoras: m.atendimento.respostaMedianaHoras, esperandoAgora: m.atendimento.esperandoAgora.length },
            satisfacaoMedia: m.satisfacao.media,
            financeiro: m.financas,
          };
      }
    },
  },
  {
    name: "resumo_do_gerente",
    kind: "read",
    soSuper: true,
    label: "Leu o resumo do gerente",
    description: "O \"gerente\" do Painel do Dono: varredura do sistema no período (clientes/onboarding, WhatsApp sem resposta, inconsistências, agenda e carga, rotinas, atividades, Distribuição, publicações, atas, relatórios, sistema) com a sugestão de cada ponto. Vem do cache (não gasta IA de novo). periodo: hoje | ontem | 7d | mes (padrão) | 30d | mes-anterior | ano.",
    parameters: obj({ periodo: { type: "string", enum: [...PERIODOS, "ontem"] } }),
    run: async (a) => {
      const id = [...PERIODOS, "ontem"].includes(String(a.periodo)) ? String(a.periodo) : "mes";
      const r = await relatorioDoGerente(id);
      if (!r.ok) throw new Error(r.error);
      return { periodo: r.gerente.periodo, varredura: gerenteEmTexto(r.gerente, { negrito: false }), pontos_encontrados: r.gerente.pontos, aviso: "As ações (marcar reunião, responder, alertar…) são feitas com um clique no painel, com confirmação.", link_no_portal: `/admin/painel?p=${id}` };
    },
  },
];

import "server-only";
import { coletarDia } from "@/lib/rotina-relatorio/dia";
import { hojeBahia } from "@/lib/rotina-relatorio/dados";
import { chaveResposta, type Valor } from "@/lib/rotina-relatorio/tipos";
import type { ToolDef } from "./tools";

// Relatório do dia das Rotinas v2: só o admin máximo lê o conteúdo das respostas
// (cada pessoa responde o próprio relatório na tela de Rotinas).

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const DIA = { type: "string", description: "Dia no formato AAAA-MM-DD (padrão: hoje)" };
const texto = (v: Valor | undefined) => (v === undefined || v === "" ? null : Array.isArray(v) ? v.join(", ") : v);
const diaValido = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : hojeBahia());

export const TOOLS_ROTINAS: ToolDef[] = [
  {
    name: "rotinas_do_dia",
    kind: "read",
    soSuper: true,
    label: "Consultou as rotinas do dia",
    description:
      "Situação das rotinas de um dia, por pessoa: se enviou o relatório (e a que horas), rotinas fixas feitas, demandas concluídas no dia e demandas vencidas em aberto. Mostra quem NÃO enviou o relatório. O dia fecha às 23:59.",
    parameters: obj({ dia: DIA }),
    run: async (a) => {
      const dia = diaValido(a.dia);
      const pessoas = await coletarDia(dia);
      return {
        dia,
        tela: "/admin/painel?aba=rotinas",
        pessoas: pessoas.map((p) => ({
          nome: p.nome,
          relatorio: !p.temModelo ? "sem modelo" : p.relatorio?.status === "enviado" ? `enviado às ${new Date(p.relatorio.enviado_em!).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })}` : p.relatorio ? "em rascunho" : "não enviado",
          rotina_fixa: p.fixas.length ? `${p.fixas.filter((f) => f.feito).length}/${p.fixas.length}` : null,
          concluidas_no_dia: p.concluidas.length,
          vencidas_em_aberto: p.vencidas.length,
        })),
      };
    },
  },
  {
    name: "ler_relatorio_rotina",
    kind: "read",
    soSuper: true,
    label: "Leu um relatório de rotina",
    description:
      "Lê o relatório enviado por UMA pessoa em um dia: respostas das perguntas (sobre ela, sobre a equipe e sobre cada pessoa) e as justificativas das demandas vencidas. Informe o nome da pessoa.",
    parameters: obj({ pessoa: { type: "string", description: "nome da pessoa" }, dia: DIA }, ["pessoa"]),
    run: async (a) => {
      const dia = diaValido(a.dia);
      const alvo = String(a.pessoa ?? "").toLowerCase().trim();
      const achadas = (await coletarDia(dia)).filter((p) => p.nome.toLowerCase().includes(alvo));
      if (!achadas.length) throw new Error(`Não achei "${a.pessoa}" na equipe.`);
      if (achadas.length > 1) throw new Error(`Há mais de uma pessoa parecida: ${achadas.map((p) => p.nome).join(", ")}. Diga qual.`);
      const p = achadas[0];
      const r = p.relatorio;
      if (!r || r.status !== "enviado" || !r.snapshot) return { pessoa: p.nome, dia, situacao: r ? "em rascunho (ainda não enviado)" : "não enviou o relatório" };
      return {
        pessoa: p.nome,
        dia,
        enviado_em: r.enviado_em,
        justificativas: r.snapshot.demandas.map((d) => ({ demanda: d.titulo, cliente: d.cliente, dias_de_atraso: d.diasAtraso, justificativa: r.justificativas[d.id] ?? null })),
        respostas: r.snapshot.perguntas.flatMap<{ secao: string; pergunta: string; sobre: string | null; resposta: string | number | null }>((q) =>
          q.secao === "equipe_pessoa"
            ? r.snapshot!.equipe.map((e) => ({ secao: q.secao, pergunta: q.texto, sobre: e.nome, resposta: texto(r.respostas[chaveResposta(q.id, e.id)]) }))
            : [{ secao: q.secao, pergunta: q.texto, sobre: null as string | null, resposta: texto(r.respostas[chaveResposta(q.id)]) }]
        ),
      };
    },
  },
];

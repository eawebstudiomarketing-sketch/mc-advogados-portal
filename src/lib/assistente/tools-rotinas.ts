import "server-only";
import { coletarDia } from "@/lib/rotina-relatorio/dia";
import { hojeBahia } from "@/lib/rotina-relatorio/dados";
import { chaveResposta, type Valor } from "@/lib/rotina-relatorio/tipos";
import { aprovarRelatorio } from "@/lib/rotina-relatorio/dados";
import { listPessoas } from "@/lib/data/escritorio";
import { getEscritorioConfig } from "@/lib/data/escritorio";
import { lerRegras, salvarRegras } from "@/lib/rotina-relatorio/regras";
import { DIAS_SEMANA, ehHorario, type RegrasRotina } from "@/lib/rotina-relatorio/regras-base";
import { createAdminClient } from "@/lib/supabase/admin";
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
      "Situação das rotinas de um dia, por pessoa: se enviou o relatório (e a que horas), rotinas fixas feitas, demandas concluídas no dia e demandas vencidas em aberto. Mostra quem NÃO enviou o relatório. O prazo do relatório da equipe e o que acontece depois dele estão nas Regras da rotina (regras_rotina). Não comente o prazo de outras pessoas.",
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
  {
    name: "aprovar_relatorio_rotina",
    kind: "confirm",
    soSuper: true,
    label: "Aprovou um relatório de rotina",
    description:
      "Aprova o relatório de rotina ENVIADO por uma pessoa em um dia, com nota de 0 a 10 e comentário opcional. A nota entra na avaliação da pessoa (Indicadores e Painel do Dono). Pede confirmação.",
    parameters: obj({ pessoa: { type: "string", description: "nome da pessoa" }, nota: { type: "integer", description: "de 0 a 10" }, comentario: { type: "string" }, dia: DIA }, ["pessoa", "nota"]),
    resumo: (a) => `Aprovar o relatório de ${a.pessoa} com nota ${a.nota}${a.comentario ? ` ("${a.comentario}")` : ""}`,
    run: async (a, ctx) => {
      const dia = diaValido(a.dia);
      const alvo = String(a.pessoa ?? "").toLowerCase().trim();
      const achadas = (await listPessoas()).filter((p) => p.nome.toLowerCase().includes(alvo));
      if (!achadas.length) throw new Error(`Não achei "${a.pessoa}" na equipe.`);
      if (achadas.length > 1) throw new Error(`Há mais de uma pessoa parecida: ${achadas.map((p) => p.nome).join(", ")}. Diga qual.`);
      await aprovarRelatorio(achadas[0].id, dia, Number(a.nota), a.comentario ? String(a.comentario) : null, ctx.profileId);
      return { aprovado: true, pessoa: achadas[0].nome, dia, nota: Number(a.nota) };
    },
  },
  // Regras da rotina (06/11/2026): o que antes era fixo no código, o admin máximo muda aqui ou em Rotinas → Regras
  {
    name: "regras_rotina",
    kind: "read",
    soSuper: true,
    label: "Consultou as regras da rotina",
    description: "Regras da rotina da equipe: horário limite do relatório do dia (geral e exceções por pessoa), se depois do limite ainda aceita com atraso ou fecha, avisos antes do limite, aviso de atraso ao dono, dias com relatório, resumo do fim do dia no Zap e agenda das 8h no Zap.",
    parameters: obj({}),
    run: async () => {
      const [r, pessoas, cfg] = await Promise.all([lerRegras(), listPessoas(), getEscritorioConfig()]);
      return { ...descreverRegras(r, new Map(pessoas.map((p) => [p.id, p.nome]))), agenda_8h_no_zap: cfg.rotina_ativa, onde_editar: "/admin/rotinas?regras=1" };
    },
  },
  {
    name: "mudar_regras_rotina",
    kind: "confirm",
    soSuper: true,
    label: "Mudou as regras da rotina",
    description: "Muda as regras da rotina (só o que vier). horario_limite 'HH:MM' vale para a equipe; para uma pessoa só, use excecao_pessoa + excecao_horario ('' tira a exceção). depois_do_limite: 'aceita' (envia até 23:59 com atraso) ou 'fecha'. dias: números 0=dom … 6=sáb. avisar_atraso: ambos, zap, portal ou nenhum. Pede confirmação.",
    parameters: obj({
      horario_limite: { type: "string", description: "HH:MM" },
      excecao_pessoa: { type: "string", description: "nome da pessoa" },
      excecao_horario: { type: "string", description: "HH:MM, ou '' para tirar" },
      depois_do_limite: { type: "string", enum: ["aceita", "fecha"] },
      aviso_topo_minutos: { type: "integer", description: "minutos antes do limite (0 = sem faixa)" },
      relogio_vermelho_minutos: { type: "integer" },
      avisar_atraso: { type: "string", enum: ["ambos", "zap", "portal", "nenhum"] },
      dias: { type: "array", items: { type: "integer" } },
      pular_feriados: { type: "boolean" },
      resumo_fim_do_dia_zap: { type: "boolean" },
      agenda_8h_no_zap: { type: "boolean" },
    }),
    resumo: (a) =>
      [
        a.horario_limite && `Horário limite da equipe: ${a.horario_limite}`,
        a.excecao_pessoa && `${a.excecao_pessoa}: ${a.excecao_horario ? `até ${a.excecao_horario}` : "volta ao horário geral"}`,
        a.depois_do_limite && (a.depois_do_limite === "fecha" ? "Depois do limite: fecha" : "Depois do limite: aceita até 23:59 com atraso"),
        a.aviso_topo_minutos !== undefined && `Aviso no topo: ${a.aviso_topo_minutos} min antes`,
        a.relogio_vermelho_minutos !== undefined && `Relógio vermelho: ${a.relogio_vermelho_minutos} min antes`,
        a.avisar_atraso && `Aviso de atraso: ${a.avisar_atraso}`,
        Array.isArray(a.dias) && `Dias: ${(a.dias as number[]).map((d) => DIAS_SEMANA[d] ?? d).join(", ")}`,
        a.pular_feriados !== undefined && `Feriado ${a.pular_feriados ? "sem" : "com"} relatório`,
        a.resumo_fim_do_dia_zap !== undefined && `Resumo do fim do dia no Zap: ${a.resumo_fim_do_dia_zap ? "ligado" : "desligado"}`,
        a.agenda_8h_no_zap !== undefined && `Agenda das 8h no Zap: ${a.agenda_8h_no_zap ? "ligada" : "desligada"}`,
      ]
        .filter(Boolean)
        .join("\n") || "Nada para mudar",
    run: async (a) => {
      const atual = await lerRegras();
      const r: RegrasRotina = { ...atual, excecoes: { ...atual.excecoes }, dias: [...atual.dias] };
      const pessoas = await listPessoas();
      if (a.horario_limite !== undefined) {
        if (!ehHorario(a.horario_limite)) throw new Error("Horário inválido: use HH:MM, ex. 18:00.");
        r.prazo = a.horario_limite;
      }
      if (a.excecao_pessoa) {
        const alvo = String(a.excecao_pessoa).toLowerCase().trim();
        const achadas = pessoas.filter((p) => p.nome.toLowerCase().includes(alvo));
        if (achadas.length !== 1) throw new Error(achadas.length ? `Há mais de uma pessoa parecida: ${achadas.map((p) => p.nome).join(", ")}.` : `Não achei "${a.excecao_pessoa}" na equipe.`);
        if (a.excecao_horario) {
          if (!ehHorario(a.excecao_horario)) throw new Error("Horário da exceção inválido: use HH:MM.");
          r.excecoes[achadas[0].id] = String(a.excecao_horario);
        } else delete r.excecoes[achadas[0].id];
      }
      if (a.depois_do_limite) r.depoisDoPrazo = a.depois_do_limite === "fecha" ? "fecha" : "aceita";
      if (a.aviso_topo_minutos !== undefined) r.avisoTopoMin = Number(a.aviso_topo_minutos);
      if (a.relogio_vermelho_minutos !== undefined) r.relogioVermelhoMin = Number(a.relogio_vermelho_minutos);
      if (a.avisar_atraso) r.avisarAtraso = a.avisar_atraso as RegrasRotina["avisarAtraso"];
      if (Array.isArray(a.dias)) r.dias = a.dias as number[];
      if (a.pular_feriados !== undefined) r.pularFeriados = !!a.pular_feriados;
      if (a.resumo_fim_do_dia_zap !== undefined) r.resumoFimDoDiaZap = !!a.resumo_fim_do_dia_zap;
      const salvas = await salvarRegras(r);
      if (a.agenda_8h_no_zap !== undefined) await createAdminClient().from("escritorio_config").update({ rotina_ativa: !!a.agenda_8h_no_zap, updated_at: new Date().toISOString() }).eq("id", 1);
      return { ok: true, ...descreverRegras(salvas, new Map(pessoas.map((p) => [p.id, p.nome]))) };
    },
  },
];

function descreverRegras(r: RegrasRotina, nomes: Map<string, string>) {
  return {
    horario_limite_equipe: r.prazo,
    excecoes: Object.entries(r.excecoes).map(([id, h]) => `${nomes.get(id) ?? "(pessoa removida)"}: ${h}`),
    depois_do_limite: r.depoisDoPrazo === "fecha" ? "fecha (não aceita mais)" : "aceita até 23:59, com atraso",
    aviso_no_topo: r.avisoTopoMin ? `${r.avisoTopoMin} min antes` : "desligado",
    relogio_vermelho: `${r.relogioVermelhoMin} min antes`,
    aviso_de_atraso_ao_dono: r.avisarAtraso,
    dias_com_relatorio: r.dias.map((d) => DIAS_SEMANA[d]).join(", "),
    feriado: r.pularFeriados ? "sem relatório" : "com relatório",
    resumo_fim_do_dia_no_zap: r.resumoFimDoDiaZap,
  };
}

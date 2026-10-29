import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERIODOS } from "@/lib/painel/base";
import { indicadoresDe } from "@/lib/painel/individual";
import { resumoDaPessoa } from "@/lib/painel/individual-ia";
import type { ToolDef } from "./tools";

// Indicadores individuais (a aba "Indicadores"): cada pessoa consulta só os
// próprios; só o admin máximo pode pedir os de outra pessoa.

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export const TOOLS_INDICADORES: ToolDef[] = [
  {
    name: "meus_indicadores",
    kind: "read",
    label: "Consultou os indicadores",
    description:
      "Indicadores individuais da pessoa no período: atividades designadas/entregues/abertas/atrasadas, % no prazo, tempo até concluir, resposta no WhatsApp, processos, publicações e andamentos, e (se pedir) o resumo com IA dela. Cada pessoa só vê os próprios; só o admin máximo pode informar `pessoa` (nome) para ver os de outra. Período: hoje, ontem, 7d, mes (padrão), 30d, mes-anterior, ano.",
    parameters: obj({
      periodo: { type: "string", enum: PERIODOS.map((x) => x.id) },
      pessoa: { type: "string", description: "nome da pessoa (só admin máximo)" },
      com_resumo_ia: { type: "boolean" },
    }),
    run: async (a, ctx) => {
      let alvo = ctx.profileId;
      if (a.pessoa) {
        if (!ctx.superAdmin) throw new Error("Só o admin máximo vê os indicadores de outra pessoa.");
        const { data } = await (createAdminClient() as unknown as SupabaseClient)
          .from("profiles")
          .select("id, full_name")
          .in("role", ["admin", "advogado"])
          .eq("ativo", true)
          .eq("oculto", false)
          .ilike("full_name", `%${String(a.pessoa).replace(/[%_,()]/g, " ").trim()}%`)
          .limit(3);
        if (!data?.length) throw new Error(`Não achei "${a.pessoa}" na equipe.`);
        if (data.length > 1) throw new Error(`Mais de uma pessoa: ${data.map((x) => x.full_name).join(", ")}. Seja mais específico.`);
        alvo = data[0].id as string;
      }
      const ind = await indicadoresDe(alvo, String(a.periodo ?? "mes"));
      if (!ind) throw new Error("Pessoa não encontrada.");
      const { serie: _serie, ...atividades } = ind.atividades;
      void _serie;
      const resumo = a.com_resumo_ia ? await resumoDaPessoa(ind) : null;
      return {
        pessoa: ind.pessoa.nome,
        periodo: ind.periodo.rotulo,
        nota: ind.nota,
        atividades,
        whatsapp: ind.whatsapp,
        trabalho: ind.trabalho,
        processos: ind.processos,
        resumo_ia: resumo?.ok ? { paragrafos: resumo.resumo.paragrafos, recomendacoes: resumo.resumo.recomendacoes } : undefined,
        link: "/admin/indicadores",
      };
    },
  },
];

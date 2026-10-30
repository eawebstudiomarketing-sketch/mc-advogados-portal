import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { lerChecklist } from "@/lib/checklist";
import { IGNORAR, nomeDoCampo } from "@/lib/historico-campos";
import type { ToolDef } from "./tools";

// Ferramentas do assistente para o que entrou no redesenho de 30/10/2026:
// aniversários dos clientes, checklist da atividade, etiquetas nos processos e
// histórico de alterações. Mesmas regras das outras: o banco da vez chega por
// parâmetro (advogado só enxerga o que já pode ver).

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const uuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v ?? ""));

function diasAteAniversario(nascimento: string, hoje: string) {
  const ano = Number(hoje.slice(0, 4));
  const mmdd = nascimento.slice(5, 10);
  let alvo = `${ano}-${mmdd}`;
  if (alvo < hoje) alvo = `${ano + 1}-${mmdd}`;
  return { dias: Math.round((Date.parse(`${alvo}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000), idade: Number(alvo.slice(0, 4)) - Number(nascimento.slice(0, 4)) };
}

export function toolsRedesenho(db: () => SupabaseClient<Database>): ToolDef[] {
  return [
    {
      name: "aniversarios_clientes",
      kind: "read",
      perm: ["clientes"],
      label: "Consultou os aniversários",
      description:
        "Clientes que fazem aniversário hoje e nos próximos dias (padrão 30), com a idade, e quantos clientes pessoa física ainda estão sem data de nascimento. O parabéns sai pela tela Contatos → Aniversários (botão ou automático às 09h).",
      parameters: obj({ dias: { type: "number", description: "Quantos dias à frente (1 a 366, padrão 30)" } }),
      run: async (a) => {
        const limite = Math.min(366, Math.max(1, Number(a.dias) || 30));
        const hoje = hojeBahia();
        const { data, error } = await db().from("clients").select("id, name, nascimento, tipo_pessoa, falecido").is("archived_at", null);
        if (error) throw new Error(error.message);
        const vivos = (data ?? []).filter((c) => !c.falecido);
        const proximos = vivos
          .filter((c) => c.nascimento)
          .map((c) => ({ id: c.id, nome: c.name, data: c.nascimento!.slice(5).split("-").reverse().join("/"), ...diasAteAniversario(c.nascimento!, hoje) }))
          .filter((c) => c.dias <= limite)
          .sort((x, y) => x.dias - y.dias);
        return { hoje, proximos, sem_data_pf: vivos.filter((c) => !c.nascimento && c.tipo_pessoa === "PF").length, tela: "/admin/clients/aniversarios" };
      },
    },
    {
      name: "checklist_atividade",
      kind: "write",
      perm: ["atividades"],
      label: "Mexeu no checklist da atividade",
      description:
        "Vê ou muda o checklist (subtarefas) de uma atividade. acao: ver | adicionar (itens = textos novos) | marcar ou desmarcar (itens = textos ou parte deles) | tirar (itens = textos).",
      parameters: obj(
        {
          activity_id: { type: "string" },
          acao: { type: "string", enum: ["ver", "adicionar", "marcar", "desmarcar", "tirar"] },
          itens: { type: "array", items: { type: "string" } },
        },
        ["activity_id", "acao"]
      ),
      resumo: (a) => `${String(a.acao)} no checklist: ${((a.itens as string[]) ?? []).join("; ")}`,
      run: async (a) => {
        if (!uuid(a.activity_id)) throw new Error("activity_id inválido.");
        const banco = db();
        const { data: atv, error } = await banco.from("activities").select("id, title, checklist").eq("id", String(a.activity_id)).maybeSingle();
        if (error) throw new Error("O checklist ainda não está disponível (a atualização do banco 0059 não foi aplicada).");
        if (!atv) throw new Error("Atividade não encontrada.");
        let lista = lerChecklist(atv.checklist);
        const itens = ((a.itens as string[]) ?? []).map((t) => String(t).trim()).filter(Boolean);
        const bate = (texto: string) => itens.some((i) => texto.toLowerCase().includes(i.toLowerCase()));
        if (a.acao === "adicionar") lista = [...lista, ...itens.map((texto) => ({ id: crypto.randomUUID(), texto: texto.slice(0, 300), feito: false }))].slice(0, 50);
        else if (a.acao === "marcar" || a.acao === "desmarcar") lista = lista.map((x) => (bate(x.texto) ? { ...x, feito: a.acao === "marcar" } : x));
        else if (a.acao === "tirar") lista = lista.filter((x) => !bate(x.texto));
        if (a.acao !== "ver") {
          const { error: e2 } = await banco.from("activities").update({ checklist: lista }).eq("id", atv.id);
          if (e2) throw new Error(e2.message);
        }
        return { atividade: atv.title, checklist: lista.map((x) => `${x.feito ? "[x]" : "[ ]"} ${x.texto}`), feitos: `${lista.filter((x) => x.feito).length}/${lista.length}` };
      },
    },
    {
      name: "etiqueta_processos",
      kind: "write",
      perm: ["processos"],
      label: "Mudou etiquetas de processos",
      description: "Põe ou tira uma etiqueta (pelo nome, as mesmas das atividades) de um ou mais processos (process_ids).",
      parameters: obj(
        {
          process_ids: { type: "array", items: { type: "string" } },
          etiqueta: { type: "string", description: "nome da etiqueta" },
          acao: { type: "string", enum: ["por", "tirar"] },
        },
        ["process_ids", "etiqueta", "acao"]
      ),
      resumo: (a) => `${a.acao === "tirar" ? "Tirar" : "Pôr"} a etiqueta "${a.etiqueta}" em ${((a.process_ids as string[]) ?? []).length} processo(s)`,
      run: async (a) => {
        const banco = db();
        const ids = ((a.process_ids as string[]) ?? []).filter(uuid).slice(0, 200);
        if (!ids.length) throw new Error("Informe os processos.");
        const { data: ets } = await banco.from("etiquetas").select("id, nome");
        const alvo = (ets ?? []).find((e) => e.nome.toLowerCase() === String(a.etiqueta ?? "").toLowerCase().trim());
        if (!alvo) throw new Error(`Não existe a etiqueta "${a.etiqueta}". Existentes: ${(ets ?? []).map((e) => e.nome).join(", ") || "nenhuma"}.`);
        const { data: procs, error } = await banco.from("processes").select("id, etiquetas").in("id", ids);
        if (error) throw new Error("Etiquetas em processos ainda não estão disponíveis (a atualização do banco 0060 não foi aplicada).");
        let n = 0;
        for (const p of procs ?? []) {
          const tem = (p.etiquetas ?? []).includes(alvo.id);
          if ((a.acao === "tirar") !== tem) continue;
          const novas = a.acao === "tirar" ? (p.etiquetas ?? []).filter((e) => e !== alvo.id) : [...(p.etiquetas ?? []), alvo.id];
          if (!(await banco.from("processes").update({ etiquetas: novas }).eq("id", p.id)).error) n++;
        }
        return { etiqueta: alvo.nome, alterados: n, tela: `/admin/processes?etiqueta=${alvo.id}` };
      },
    },
    {
      name: "historico_alteracoes",
      kind: "read",
      soSuper: true,
      label: "Viu o histórico de alterações",
      description: "Quem criou, editou ou excluiu um cliente, processo ou atividade, quando e quais campos mudou (últimos 30 registros).",
      parameters: obj({ tipo: { type: "string", enum: ["cliente", "processo", "atividade"] }, id: { type: "string" } }, ["tipo", "id"]),
      run: async (a) => {
        if (!uuid(a.id)) throw new Error("id inválido.");
        const tabela = a.tipo === "cliente" ? "clients" : a.tipo === "processo" ? "processes" : "activities";
        // auditoria não está nos tipos gerados
        const { data, error } = await (db() as unknown as SupabaseClient)
          .from("auditoria")
          .select("quando, acao, campos, profiles(full_name)")
          .eq("tabela", tabela)
          .eq("registro_id", String(a.id))
          .order("quando", { ascending: false })
          .limit(30);
        if (error) throw new Error(error.message);
        type Linha = { quando: string; acao: string; campos: string[] | null; profiles: { full_name: string } | null };
        return (data as unknown as Linha[])
          .map((e) => ({
            quando: new Date(e.quando).toLocaleString("pt-BR", { timeZone: "America/Bahia" }),
            quem: e.profiles?.full_name ?? "Sistema",
            acao: e.acao,
            campos: (e.campos ?? []).filter((c) => !IGNORAR.has(c)).map(nomeDoCampo),
          }))
          .filter((e) => e.acao !== "editou" || e.campos.length);
      },
    },
  ];
}

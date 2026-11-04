import "server-only";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { normalizarSecoes, type Secao } from "./tipos";

// Regimento Interno: a IA monta o questionário da empresa (seções e perguntas
// variam com o ramo) e edita o questionário a partir de um pedido em texto.

const ESQUEMA_SECOES = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      titulo: { type: "string" },
      descricao: { type: "string" },
      perguntas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            tipo: { type: "string", enum: ["paragrafo", "curta", "multipla", "caixas", "data", "hora"] },
            texto: { type: "string" },
            ajuda: { type: "string" },
            opcoes: { type: "array", items: { type: "string" } },
            outro: { type: "boolean" },
            obrigatoria: { type: "boolean" },
          },
          required: ["tipo", "texto"],
        },
      },
    },
    required: ["titulo", "perguntas"],
  },
};

const MODELO_REFERENCIA = `Exemplo real do escritório (padaria), para o tom e o nível de detalhe:
SEÇÃO – INFORMAÇÕES GERAIS DA PADARIA: Nome empresarial; CNPJ (curta); Endereço completo; A empresa possui apenas uma unidade? (múltipla: SIM/NÃO + Outro); Horário de funcionamento (curta); Quantidade de funcionários (curta); Missão; Visão; Valores.
SEÇÃO – ESTRUTURA ORGANIZACIONAL: Existe organograma…?; Qual o principal modelo do negócio? (caixas: Padaria tradicional, Confeitaria, Produção própria de pães e salgados, Lanchonete/cafeteria, Mercearia integrada, Delivery + Outro); Quem possui autoridade para aplicar regras e penalidades internas?; …
SEÇÃO – CONTRATAÇÃO E COMPOSIÇÃO DA EQUIPE: Quais modalidades de contratação existem? (caixas: CLT indeterminado, Contrato de experiência, Aprendizes, Estagiários, Temporários, Prestadores de serviços, Outros); Quais cargos e funções existem? Quantidade por função; Existem empregados menores de 18 anos?; Existe convenção coletiva aplicável? …
Outras seções do exemplo: Jornada/funcionamento; Normas de conduta; Produção, cozinha e panificação (específica do ramo); Celular, imagem e redes sociais; Atendimento, caixa e vendas; Higiene e segurança alimentar; Saúde e segurança do trabalho; Conduta, disciplina e relacionamento; Patrimônio, informação e tecnologia; Benefícios, uniforme e rotinas administrativas; Medidas disciplinares; Objetivos e necessidades específicas; Revisão e disposições finais.`;

const SISTEMA_GERAR = `Você é advogado trabalhista de um escritório brasileiro e prepara o QUESTIONÁRIO que a empresa cliente vai responder para o escritório elaborar o Regimento Interno dela (organização, jornada, conduta, segurança, disciplina, LGPD, etc., conforme CLT e normas aplicáveis).
Monte entre 15 e 18 seções, ESPECÍFICAS do ramo da empresa (ex.: padaria tem "Produção, cozinha e panificação" e "Higiene e segurança alimentar"; loja de máquinas tem "Montagem, instalação e serviços externos"). Cada seção com 4 a 12 perguntas claras, em português do Brasil, que a empresa consiga responder sem ajuda.
Tipos: "paragrafo" (resposta longa, a maioria), "curta" (CNPJ, quantidade, horário de funcionamento), "multipla" (uma opção; use outro=true quando cabe "Outro"), "caixas" (várias opções), "data", "hora".
Use multipla/caixas onde as opções são previsíveis (sim/não, modalidades de contratação, registro de ponto, regras que deseja instituir). Nenhuma pergunta obrigatória, salvo nome empresarial e CNPJ.
Primeira seção sempre "INFORMAÇÕES GERAIS" da empresa; as últimas: medidas disciplinares, objetivos/necessidades específicas e disposições finais. Títulos de seção em MAIÚSCULAS, no formato "SEÇÃO N – TÍTULO". Uma descrição curta por seção.
Não pergunte o que já foi informado nos dados da empresa, a não ser para confirmar.`;

const ESQUEMA_PERGUNTAS = ESQUEMA_SECOES.items.properties.perguntas;

/** Monta em duas etapas (a IA barata resume demais quando faz tudo de uma vez):
 *  1) a lista de seções do ramo; 2) as perguntas de cada seção, em paralelo. */
export async function gerarQuestionario(d: { nome: string; segmento: string; dados: Record<string, string> }): Promise<{ ok: true; titulo: string; descricao: string; secoes: Secao[] } | { ok: false; error: string }> {
  const info = Object.entries(d.dados)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const empresa = `Empresa: ${d.nome}\nRamo/segmento: ${d.segmento}\n${info}`;

  const roteiro = await generateJson<{ descricao: string; secoes: { titulo: string; descricao: string; foco: string }[] }>({
    system: `${SISTEMA_GERAR}\n\n${MODELO_REFERENCIA}\n\nNESTA ETAPA devolva só o roteiro: entre 15 e 18 seções (título, descrição curta e "foco" = os assuntos que as perguntas da seção devem cobrir) e a "descricao" do formulário no estilo "🎯 OBJETIVO / Coletar informações para elaboração de Regimento Interno claro, aplicável e juridicamente seguro, com foco em: …" (com 4 a 6 focos em linhas separadas).`,
    parts: [{ text: empresa }],
    model: MODELOS.onboarding, funcao: "regimentos",
    schema: {
      type: "object",
      properties: {
        descricao: { type: "string" },
        secoes: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" }, foco: { type: "string" } }, required: ["titulo", "descricao", "foco"] } },
      },
      required: ["descricao", "secoes"],
    },
  });
  if (!roteiro.ok) return roteiro;
  const lista = roteiro.data.secoes.slice(0, 20);
  if (lista.length < 5) return { ok: false, error: "A IA devolveu poucas seções. Tente de novo." };
  const titulos = lista.map((s, i) => `${i + 1}. ${s.titulo}`).join("\n");

  const perguntas = await Promise.all(
    lista.map((s) =>
      generateJson<{ perguntas: unknown[] }>({
        system: `${SISTEMA_GERAR}\n\n${MODELO_REFERENCIA}\n\nNESTA ETAPA escreva só as perguntas de UMA seção: entre 6 e 12 perguntas (mínimo 6), específicas da empresa, sem repetir assuntos das outras seções.`,
        parts: [{ text: `${empresa}\n\nTodas as seções do questionário:\n${titulos}\n\nSeção a escrever agora: ${s.titulo}\nDescrição: ${s.descricao}\nAssuntos a cobrir: ${s.foco}` }],
        model: MODELOS.onboarding, funcao: "regimentos",
        schema: { type: "object", properties: { perguntas: ESQUEMA_PERGUNTAS }, required: ["perguntas"] },
      })
    )
  );
  const secoes = normalizarSecoes(lista.map((s, i) => ({ titulo: s.titulo, descricao: s.descricao, perguntas: perguntas[i].ok ? perguntas[i].data.perguntas : [] })));
  const vazias = secoes.filter((s) => !s.perguntas.length).length;
  if (vazias > 2) return { ok: false, error: "A IA não conseguiu escrever as perguntas agora. Tente de novo em instantes." };
  return { ok: true, titulo: `REGIMENTO INTERNO – ${d.nome.toUpperCase()}`, descricao: roteiro.data.descricao, secoes: secoes.filter((s) => s.perguntas.length) };
}

const SISTEMA_EDITAR = `Você edita o questionário de Regimento Interno de uma empresa a pedido do advogado.
Recebe o questionário atual em JSON e o pedido. Devolva o questionário COMPLETO já alterado, no mesmo formato.
Mexa só no que foi pedido; mantenha o "id" das seções e perguntas que continuam (pergunta nova: id novo curto). Português do Brasil.`;

export async function editarQuestionario(atual: { descricao: string | null; secoes: Secao[] }, pedido: string, empresa: string): Promise<{ ok: true; descricao: string; secoes: Secao[] } | { ok: false; error: string }> {
  const r = await generateJson<{ descricao: string; secoes: unknown }>({
    system: SISTEMA_EDITAR,
    parts: [{ text: `Empresa: ${empresa}\nPedido: ${pedido}\n\nQuestionário atual:\n${JSON.stringify({ descricao: atual.descricao ?? "", secoes: atual.secoes })}` }],
    model: MODELOS.onboarding, funcao: "regimentos",
    schema: {
      type: "object",
      properties: { descricao: { type: "string" }, secoes: ESQUEMA_SECOES },
      required: ["descricao", "secoes"],
    },
  });
  if (!r.ok) return r;
  const secoes = normalizarSecoes(r.data.secoes);
  if (!secoes.length) return { ok: false, error: "A IA não devolveu o questionário. Tente explicar o pedido de outro jeito." };
  return { ok: true, descricao: r.data.descricao, secoes };
}

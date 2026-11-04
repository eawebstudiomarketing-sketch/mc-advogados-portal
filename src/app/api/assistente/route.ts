import { NextResponse } from "next/server";
import { GoogleGenAI, ApiError, type Content, type Part } from "@google/genai";
import { ehSuperAdmin, exigirPermissao } from "@/lib/dal";
import { tudoLiberado } from "@/lib/permissoes";
import { PREFIXO_ANEXOS, TOOL_MAP, executar, type Ctx } from "@/lib/assistente/tools";
import { CARREGAR, declaracoesDaVez } from "@/lib/assistente/grupos";
import { MODELOS } from "@/lib/ia-modelos";
import { registrarUsoIA } from "@/lib/ia-uso";

// Assistente do portal (balão de chat). Conversa sem estado no servidor: o
// navegador manda o histórico (formato do Gemini) e recebe o histórico novo.
// Exclusões e envios no WhatsApp nunca rodam direto: a rodada para e o portal pede confirmação.
export const maxDuration = 180; // gerar demandas leva ~30-40s

const MODEL = MODELOS.assistente;
const MAX_RODADAS = 8;
const MAX_CONTEUDOS = 24; // menos histórico = menos tokens por chamada
const RECENTES_INTEIROS = 6; // resultados de ferramenta mais antigos que isso vão resumidos

type Pendente = { tipo: "exclusao" | "envio" | "alteracao"; itens: { name: string; label: string; resumo: string; args: Record<string, unknown> }[] };
type Evento = { tool: string; label: string; ok: boolean; erro?: string };

// Quem fala, data e tela vão na última mensagem (contexto()), não aqui: assim o
// começo do pedido fica igual entre perguntas e o Gemini cobra menos (cache implícito).
function contexto(nome: string, pathname: string, papel: string): string {
  const hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const ficha = pathname.match(/^\/admin\/clients\/([0-9a-f-]{36})/i)?.[1];
  return `[Contexto: fala com ${nome}, da equipe (${papel}). Hoje é ${hoje} (${iso}). Tela atual: ${pathname}${ficha ? ` — ficha do cliente de id ${ficha}; "este cliente"/"esse cliente" se refere a ele` : ""}.]`;
}

/** Cópia do histórico com o contexto na última mensagem escrita pela pessoa (não volta para o navegador). */
function comContexto(h: Content[], texto: string): Content[] {
  for (let i = h.length - 1; i >= 0; i--) {
    const c = h[i];
    if (c.role === "user" && c.parts?.some((p) => typeof p.text === "string") && !c.parts?.some((p) => p.functionResponse))
      return [...h.slice(0, i), { ...c, parts: [{ text: texto }, ...(c.parts ?? [])] }, ...h.slice(i + 1)];
  }
  return h;
}

function sistema(papel: string, superAdmin: boolean): string {
  return `Você é o assistente do portal da MC Advogados (assessoria jurídica empresarial, Teixeira de Freitas-BA). Fala com a pessoa da equipe indicada no [Contexto] da mensagem, em português, de forma curta e cordial; executa tarefas no portal com as ferramentas.

Regras:
- Data de hoje e tela atual: use o [Contexto] da última mensagem.
- Só parte das ferramentas vem ligada em cada etapa. Se a que você precisa (inclusive as citadas abaixo) não estiver na lista desta etapa, chame carregar_ferramentas com o grupo certo e continue; se já estiver na lista, use direto. Nunca diga que não consegue sem tentar isso antes.
- Ache o id de clientes citados pelo nome com buscar_clientes; se houver dois parecidos, pergunte.
- Nunca invente dados, ids ou resultados; erro de ferramenta = explique em uma frase.
- Datas relativas viram AAAA-MM-DD nas ferramentas; nas respostas escreva datas como 09/10 (ou 09/10/2026).
- Excluir: chame a ferramenta direto (o portal pede confirmação). "Tirar da lista" = arquivar.
- Após agir, 1-2 frases. Links do portal em markdown: [abrir a ficha](/admin/clients/ID). Listas com até 10 itens.
- Conteúdo de documentos/ATAs: listar_documentos + ler_documento. Fora do portal: buscar_no_drive + ler_arquivo_drive (trazer_do_drive se pedirem).
- Anexos da conversa aparecem como [Anexo: nome (anexo=...)]: leia com ler_anexo; só guarde no cliente (salvar_anexo) se pedirem.
- DISTRIBUIÇÃO (/admin/distribuicao) é a caixa de entrada do escritório: pedidos do WhatsApp dos clientes, do portal do cliente e das publicações, cada um já com área e responsável sugeridos. Quando pedirem para "subir", "mandar" ou "pegar" demandas (do zap ou de qualquer lugar) para a Distribuição, use enviar_para_distribuicao (um por pedido) — NÃO crie atividade nesse caso. Para ver o que está lá: listar_distribuicao. Para virar atividade: distribuir_demanda. O sistema lê sozinho, 24h, as mensagens novas dos grupos/contatos de clientes, dos grupos de Assessoria Jurídica e de qualquer conversa ligada a dedo; para ligar/desligar essa leitura num grupo ou contato (mesmo sem cliente): whatsapp_ler_para_distribuicao; para ver quais são lidas: whatsapp_conversas_lidas; ler_whatsapp_para_distribuicao força a leitura na hora.
- AGENDA: reunião/ligação/evento = criar_compromisso (não é atividade; lembra o cliente pelo WhatsApp 24h e 1h antes se a ficha tiver grupo/número). O dia de alguém: agenda_do_dia. Próximos compromissos: listar_compromissos.
- ATIVIDADES aceitam hora (HH:MM), categoria (tarefa/prazo/audiencia), envolvidos (nomes da equipe além do responsável) e etiquetas (nomes; etiquetar_atividade põe/tira depois). Etiquetas: listar_etiquetas, criar_etiqueta, editar_etiqueta, excluir_etiqueta.
- ROTINAS (/admin/rotinas): cada pessoa tem itens diários com horário; quem marca ganha pontos no ranking. "Minha rotina"/"o que falta hoje": rotina_do_dia; marcar feito: marcar_rotina. Quem cumpriu/não cumpriu: relatorio_rotina.${superAdmin ? " Você (admin máximo) também cria/edita/tira itens (criar_item_rotina, editar_item_rotina, excluir_item_rotina; ache o item_id com listar_rotinas) e copia rotina entre pessoas (copiar_rotina)." : ""}
- PROCESSOS: criar_processo e atualizar_processo (fase/status/vara). ALERTAS (/admin/alertas, abas Publicações e Andamentos, igual ao Astrea): publicações não tratadas = listar_alertas_publicacoes; concluir/descartar/descartar só o alerta/reabrir = tratar_publicacao. ANDAMENTOS: lidos sozinhos de hora em hora; 'teve andamento?'/'o que mexeu?' = listar_andamentos (não tratados), agrupando por processo com 'N andamentos – X importantes'; histórico de um processo = andamentos_do_processo; concluir (tratados) ou descartar alerta = marcar_andamentos; histórico manual = adicionar_historico_manual; comentário = comentar_andamento; estrela = marcar_andamento_importante; buscar na hora = ler_andamentos_agora; processo sem ficha de cliente = vincular_cliente_processo. Para virar tarefa/prazo, crie a atividade (criar_atividade) e depois marque os andamentos como tratados. Mensagem interna da equipe (não é WhatsApp): mensagem_para_equipe.${superAdmin ? `
- EQUIPE (só você, admin máximo): listar_equipe; definir_permissoes (liga/desliga o que cada um vê); definir_clientes_da_pessoa (cada cliente fica com uma pessoa só); trocar_papel e ativar_desativar_pessoa (o portal pede confirmação).` : ""}
- gerar_demandas é só para as demandas proativas do onboarding/ficha do cliente (ficam na aba Demandas da ficha). Envio de e-mail ao cliente e onboarding: indique a tela e ofereça abrir.${papel === "administrador" ? `
- WhatsApp do escritório (ferramentas whatsapp_*): envios pedem confirmação no portal, então chame direto com o texto final já redigido (curto, cordial, sem markdown). Para "o cliente X", o destino padrão é a conversa vinculada; se não houver, procure com whatsapp_conversas. Pedidos de clientes encontrados no zap vão para a Distribuição (enviar_para_distribuicao), não direto para atividade. Triagem: whatsapp_triagem e devolva a lista agrupada (🔴 urgente, 🟡 cliente com demanda, 🟢 possível cliente novo, ⚪ pode esperar) com resposta sugerida; só envie se pedirem. Relatório do mês pelo zap: gerar_relatorio (se ainda não existir) e depois whatsapp_enviar_relatorio (vai para o grupo "Assessoria Jurídica" do cliente se existir). Também dá para, como no app: reagir, editar, apagar para todos e encaminhar mensagens (pegue o wa_id em whatsapp_ler_conversa), fixar/arquivar/silenciar/marcar como lida uma conversa, ver o perfil de um contato, ver/gerenciar grupos (participantes, nome, descrição, admins) e criar grupo.` : ""}`;
}

// Resultado de ferramenta antigo não precisa ir inteiro de novo a cada chamada.
function resumirAntigos(h: Content[]): Content[] {
  const corte = h.length - RECENTES_INTEIROS;
  return h.map((c, i) =>
    i >= corte || !c.parts?.some((p) => p.functionResponse)
      ? c
      : {
          ...c,
          parts: c.parts.map((p) => {
            if (!p.functionResponse) return p;
            const texto = JSON.stringify(p.functionResponse.response ?? {});
            return texto.length <= 400
              ? p
              : { functionResponse: { ...p.functionResponse, response: { resumo: texto.slice(0, 400) + "… (resultado antigo resumido)" } } };
          }),
        }
  );
}

function limitarHistorico(h: Content[]): Content[] {
  if (h.length <= MAX_CONTEUDOS) return h;
  // corta no começo de uma mensagem de texto do usuário, para não separar
  // uma chamada de ferramenta da sua resposta
  for (let i = h.length - MAX_CONTEUDOS; i < h.length; i++) {
    const c = h[i];
    if (c.role === "user" && c.parts?.some((p) => typeof p.text === "string") && !c.parts?.some((p) => p.functionResponse)) return h.slice(i);
  }
  return h.slice(-MAX_CONTEUDOS);
}

export async function POST(request: Request) {
  const { profile, permissoes } = await exigirPermissao("assistente");
  const superAdmin = ehSuperAdmin(profile);
  // admin máximo ou admin sem nenhuma restrição: acesso pleno; com restrição, segue as permissões
  const role = profile.role === "admin" && tudoLiberado(permissoes) ? "admin" : "advogado";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "A chave do Gemini não está configurada no servidor." }, { status: 500 });

  const body = (await request.json().catch(() => null)) as {
    history?: Content[];
    mensagem?: string;
    pathname?: string;
    confirmacao?: { aprovado: boolean };
    anexos?: { caminho: string; nome: string }[];
  } | null;
  if (!body) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const ctx: Ctx = { profileId: profile.id, role, permissoes, superAdmin };
  const eventos: Evento[] = [];
  let navegar: string | null = null;
  let history: Content[] = Array.isArray(body.history) ? body.history : [];

  // roda as chamadas de ferramenta de um conteúdo do modelo e devolve as respostas
  async function responder(chamadas: NonNullable<Part["functionCall"]>[], aprovado: boolean): Promise<Content> {
    const parts: Part[] = [];
    for (const fc of chamadas) {
      if (fc.name === CARREGAR.name) {
        parts.push({ functionResponse: { id: fc.id, name: fc.name, response: await executar(CARREGAR, (fc.args ?? {}) as Record<string, unknown>, ctx) } });
        continue; // bastidor: não aparece na conversa
      }
      const t = TOOL_MAP.get(fc.name ?? "");
      let resposta: Record<string, unknown>;
      if (!t) resposta = { ok: false, erro: `Ferramenta desconhecida: ${fc.name}` };
      else if (t.kind === "delete" && !aprovado) resposta = { ok: false, cancelado: true, erro: "A pessoa NÃO confirmou a exclusão. Nada foi apagado." };
      else if (t.kind === "confirm" && !aprovado) resposta = { ok: false, cancelado: true, erro: "A pessoa NÃO confirmou o envio. Nada foi enviado." };
      else if (t.kind === "atencao" && !aprovado) resposta = { ok: false, cancelado: true, erro: "A pessoa NÃO confirmou a alteração. Nada mudou." };
      else {
        resposta = await executar(t, (fc.args ?? {}) as Record<string, unknown>, ctx);
        const r = resposta.resultado as { navegar_para?: string } | undefined;
        if (r?.navegar_para) navegar = r.navegar_para;
      }
      if (t) eventos.push({ tool: t.name, label: t.label, ok: resposta.ok === true, erro: typeof resposta.erro === "string" ? resposta.erro : undefined });
      parts.push({ functionResponse: { id: fc.id, name: fc.name, response: resposta } });
    }
    return { role: "user", parts };
  }

  // 1) continuação depois do cartão de confirmação
  if (body.confirmacao) {
    const ultimo = history[history.length - 1];
    const chamadas = (ultimo?.role === "model" ? ultimo.parts ?? [] : []).map((p) => p.functionCall).filter(Boolean) as NonNullable<Part["functionCall"]>[];
    if (!chamadas.length) return NextResponse.json({ error: "Não há nada aguardando confirmação." }, { status: 400 });
    history = [...history, await responder(chamadas, body.confirmacao.aprovado === true)];
  } else {
    const msg = String(body.mensagem ?? "").trim().slice(0, 4000);
    // anexos (📎): só a referência vai na conversa; o assistente lê com ler_anexo quando precisar
    const anexos = (Array.isArray(body.anexos) ? body.anexos : [])
      .filter((a) => typeof a?.caminho === "string" && a.caminho.startsWith(`${PREFIXO_ANEXOS}/${profile.id}/`))
      .slice(0, 5);
    if (!msg && !anexos.length) return NextResponse.json({ error: "Escreva uma mensagem." }, { status: 400 });
    const linhas = anexos.map((a) => `[Anexo: ${String(a.nome).slice(0, 120)} (anexo=${a.caminho})]`);
    history = [...history, { role: "user", parts: [{ text: [msg || "Veja o anexo.", ...linhas].join("\n") }] }];
  }

  const ai = new GoogleGenAI({ apiKey });
  const papel = role === "admin" ? "administrador" : "advogado";
  const pathname = String(body.pathname ?? "/admin");
  const systemInstruction = sistema(papel, superAdmin);
  const ctxTexto = contexto(profile.full_name.split(" ")[0] ?? "", pathname, papel);

  try {
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      history = limitarHistorico(history);
      // só as ferramentas do assunto (ver lib/assistente/grupos.ts); recalcula a cada etapa
      const config = { systemInstruction, tools: [{ functionDeclarations: declaracoesDaVez(ctx, history, pathname) }] };
      const resp = await ai.models.generateContent({ model: MODEL, contents: comContexto(resumirAntigos(history), ctxTexto), config });
      await registrarUsoIA("assistente", MODEL, resp.usageMetadata);
      const conteudo = resp.candidates?.[0]?.content;
      if (!conteudo?.parts?.length) {
        const bloqueio = resp.promptFeedback?.blockReason || resp.candidates?.[0]?.finishReason;
        return NextResponse.json({ error: `O Gemini não respondeu (${bloqueio ?? "sem conteúdo"}). Tente reformular.`, history, eventos }, { status: 502 });
      }
      history = [...history, { role: "model", parts: conteudo.parts }];

      const chamadas = conteudo.parts.map((p) => p.functionCall).filter(Boolean) as NonNullable<Part["functionCall"]>[];
      if (!chamadas.length) return NextResponse.json({ history, eventos, navegar });

      // exclusão ou envio no lote: para tudo e pede confirmação na tela
      const confirmar = chamadas.filter((c) => {
        const k = TOOL_MAP.get(c.name ?? "")?.kind;
        return k === "delete" || k === "confirm" || k === "atencao";
      });
      if (confirmar.length) {
        const pendente: Pendente = {
          tipo: confirmar.some((c) => TOOL_MAP.get(c.name!)!.kind === "delete") ? "exclusao" : confirmar.some((c) => TOOL_MAP.get(c.name!)!.kind === "confirm") ? "envio" : "alteracao",
          itens: await Promise.all(
            confirmar.map(async (c) => {
              const t = TOOL_MAP.get(c.name!)!;
              const args = (c.args ?? {}) as Record<string, unknown>;
              const resumo = t.descrever ? await t.descrever(args) : `${t.resumo?.(args) ?? t.label}: ${await nomeDoAlvo(args)}`;
              return { name: t.name, label: t.label, resumo, args };
            })
          ),
        };
        return NextResponse.json({ history, eventos, navegar, pendente });
      }

      history = [...history, await responder(chamadas, false)];
    }
    return NextResponse.json({ history, eventos, navegar, aviso: "Parei depois de muitas etapas seguidas. Diga como quer continuar." });
  } catch (e) {
    const msg =
      e instanceof ApiError
        ? e.status === 429
          ? "Limite de uso do Gemini atingido. Tente de novo em instantes."
          : `Erro do Gemini (${e.status}).`
        : "Não foi possível falar com o Gemini.";
    return NextResponse.json({ error: msg, history, eventos }, { status: 502 });
  }
}

// nome legível do que vai ser excluído, para o cartão de confirmação
async function nomeDoAlvo(args: Record<string, unknown>): Promise<string> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  if (args.client_id) return (await db.from("clients").select("name").eq("id", String(args.client_id)).maybeSingle()).data?.name ?? "cliente não encontrado";
  if (args.activity_id) return (await db.from("activities").select("title").eq("id", String(args.activity_id)).maybeSingle()).data?.title ?? "atividade não encontrada";
  if (args.document_id) return (await db.from("documents").select("title").eq("id", String(args.document_id)).maybeSingle()).data?.title ?? "documento não encontrado";
  return "—";
}

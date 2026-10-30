import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { getEscritorioConfig, listPessoas, sugerirResponsavel } from "@/lib/data/escritorio";
import { lerConversasDoZap } from "@/lib/distribuicao/ler-zap";
import { diaDaPessoa } from "@/lib/data/rotina";
import { reagendarLembretes, cancelarLembretes } from "@/lib/zap/lembretes";
import { destinoDoCliente, enfileirarMensagem } from "@/lib/zap/fila";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import type { Ctx, ToolDef } from "./tools";

// Ferramentas do assistente para a Distribuição (caixa de entrada de pedidos)
// e a Agenda (compromissos e o dia de cada pessoa). Mesmas regras das
// ferramentas de tools.ts; o banco da vez chega por parâmetro.

type Db = SupabaseClient<Database>;
const DATA = { type: "string", description: "Data no formato AAAA-MM-DD" };
const HORA = { type: "string", description: "Hora no formato HH:MM (horário da Bahia)" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const termo = (s: unknown) => String(s ?? "").replace(/[,()%*\\]/g, " ").trim();

async function pessoaPorNome(alvo: unknown): Promise<string> {
  const t = termo(alvo).toLowerCase();
  const pessoas = await listPessoas();
  const achadas = pessoas.filter((p) => p.nome.toLowerCase().includes(t) || p.email.toLowerCase().includes(t));
  const exata = achadas.find((p) => p.nome.toLowerCase() === t);
  if (!achadas.length) throw new Error(`Não achei "${alvo}" na equipe.`);
  if (!exata && achadas.length > 1) throw new Error(`Há mais de uma pessoa parecida com "${alvo}": ${achadas.map((p) => p.nome).join(", ")}. Diga qual.`);
  return (exata ?? achadas[0]).id;
}

async function meuResponsavel(ctx: Ctx): Promise<string | null> {
  const { data } = await createAdminClient().from("responsaveis").select("id").eq("profile_id", ctx.profileId).maybeSingle();
  return data?.id ?? null;
}

async function areaValida(area: unknown): Promise<string | null> {
  if (!area) return null;
  const { areas } = await getEscritorioConfig();
  return areas.find((a) => a.toLowerCase() === String(area).toLowerCase()) ?? null;
}

export function toolsOperacao(db: () => Db): ToolDef[] {
  return [
    // ───────── Distribuição ─────────
    {
      name: "listar_distribuicao",
      kind: "read",
      perm: ["distribuicao"],
      label: "Consultou a Distribuição",
      description:
        "Lista os pedidos esperando distribuição (caixa de entrada do escritório). origem: whatsapp | portal_cliente | publicacao (vazio = todas). Cada item já tem área e responsável sugeridos.",
      parameters: obj({ origem: { type: "string", enum: ["whatsapp", "portal_cliente", "publicacao"] }, client_id: { type: "string" } }),
      run: async (a) => {
        let q = db()
          .from("distribuicao")
          .select("id, origem, titulo, descricao, area, tipo, prioridade, prazo_sugerido, created_at, clients(name), responsaveis(nome)")
          .eq("status", "pendente")
          .order("created_at", { ascending: false })
          .limit(40);
        if (a.origem) q = q.eq("origem", String(a.origem));
        if (a.client_id) q = q.eq("client_id", String(a.client_id));
        const { data, error } = await q;
        if (error) throw error;
        return { total: data.length, itens: data, tela: "/admin/distribuicao" };
      },
    },
    {
      name: "enviar_para_distribuicao",
      kind: "write",
      perm: ["distribuicao"],
      label: "Mandou para a Distribuição",
      description:
        "Coloca um pedido na Distribuição (NÃO cria atividade): use quando pedirem para 'subir', 'mandar' ou 'jogar' demandas na Distribuição, ou ao separar pedidos do WhatsApp. O responsável é decidido sozinho pela área (ou informe responsavel). origem: whatsapp (padrão), portal_cliente ou outro.",
      parameters: obj(
        {
          client_id: { type: "string" },
          titulo: { type: "string", description: "Curto, começando com verbo no infinitivo" },
          descricao: { type: "string" },
          area: { type: "string", description: "Uma das áreas do escritório (Trabalhista, Empresarial, Contratos, Marcas e Patentes...)" },
          tipo: { type: "string", enum: ACTIVITY_TYPES as unknown as string[] },
          prioridade: { type: "string", enum: ["baixa", "media", "alta"] },
          prazo: DATA,
          origem: { type: "string", enum: ["whatsapp", "portal_cliente", "outro"] },
          mensagens: { type: "array", items: { type: "string" }, description: "Trechos das mensagens do cliente que originaram o pedido" },
          responsavel: { type: "string", description: "Nome de quem deve ficar responsável (opcional)" },
        },
        ["client_id", "titulo"]
      ),
      run: async (a) => {
        const area = await areaValida(a.area);
        const clientId = String(a.client_id);
        const { data: cli } = await db().from("clients").select("id").eq("id", clientId).maybeSingle();
        if (!cli) throw new Error("Cliente não encontrado.");
        const responsavel = a.responsavel ? await pessoaPorNome(a.responsavel) : await sugerirResponsavel(area, undefined, clientId);
        const { data, error } = await db()
          .from("distribuicao")
          .insert({
            origem: String(a.origem ?? "whatsapp"),
            client_id: clientId,
            titulo: String(a.titulo).slice(0, 200),
            descricao: a.descricao ? String(a.descricao) : null,
            area,
            tipo: ACTIVITY_TYPES.includes(String(a.tipo) as never) ? String(a.tipo) : null,
            prioridade: ["baixa", "media", "alta"].includes(String(a.prioridade)) ? String(a.prioridade) : "media",
            prazo_sugerido: a.prazo ? String(a.prazo) : null,
            responsavel_sugerido: responsavel,
            trechos: (Array.isArray(a.mensagens) ? a.mensagens : []).slice(0, 8).map((t) => ({ texto: String(t).slice(0, 600), quem: "Cliente" })) as never,
          })
          .select("id, titulo, area, responsaveis(nome)")
          .single();
        if (error) throw error;
        return { ...data, tela: "/admin/distribuicao" };
      },
    },
    {
      name: "ler_whatsapp_para_distribuicao",
      kind: "write",
      soAdmin: true,
      label: "Leu o WhatsApp dos clientes",
      description:
        "Lê agora as mensagens novas dos grupos/contatos lidos pela Distribuição (clientes vinculados, grupos de Assessoria Jurídica e os ligados com whatsapp_ler_para_distribuicao) e coloca os pedidos encontrados na Distribuição (o sistema já faz isso sozinho ao chegar mensagem; use quando pedirem para conferir na hora).",
      parameters: obj({}),
      run: async () => {
        const r = await lerConversasDoZap();
        if (r.erro) throw new Error(r.erro);
        return { ...r, tela: "/admin/distribuicao?origem=whatsapp" };
      },
    },
    {
      name: "distribuir_demanda",
      kind: "write",
      perm: ["distribuicao"],
      label: "Distribuiu uma demanda",
      description:
        "Transforma um pedido da Distribuição em atividade (id de listar_distribuicao). Sem responsavel, usa o sugerido. Pode ajustar título, área, tipo e prazo.",
      parameters: obj(
        {
          id: { type: "string" },
          responsavel: { type: "string" },
          titulo: { type: "string" },
          area: { type: "string" },
          tipo: { type: "string", enum: ACTIVITY_TYPES as unknown as string[] },
          prazo: DATA,
        },
        ["id"]
      ),
      run: async (a, ctx) => {
        const { data: item } = await db()
          .from("distribuicao")
          .select("id, status, client_id, titulo, descricao, area, tipo, prazo_sugerido, responsavel_sugerido, activity_id, publicacao_id, trechos")
          .eq("id", String(a.id))
          .maybeSingle();
        if (!item || item.status !== "pendente") throw new Error("Pedido não encontrado ou já distribuído.");
        if (!item.client_id) throw new Error("Este pedido não tem cliente: diga para qual cliente é (abra a Distribuição para escolher).");
        const respId = a.responsavel ? await pessoaPorNome(a.responsavel) : item.responsavel_sugerido;
        if (!respId) throw new Error("Diga quem fica responsável.");
        const { data: resp } = await createAdminClient().from("responsaveis").select("id, profile_id, nome").eq("id", respId).single();
        const trechos = (Array.isArray(item.trechos) ? item.trechos : []) as { texto?: string; quem?: string }[];
        const campos = {
          title: String(a.titulo ?? item.titulo).slice(0, 200),
          description: [item.descricao, ...trechos.map((t) => `${t.quem ?? "Cliente"}: ${t.texto ?? ""}`)].filter(Boolean).join("\n\n") || null,
          area: (await areaValida(a.area)) ?? item.area,
          type: (ACTIVITY_TYPES.includes(String(a.tipo ?? item.tipo) as never) ? String(a.tipo ?? item.tipo) : "consultoria") as never,
          deadline: a.prazo ? String(a.prazo) : item.prazo_sugerido,
          responsavel_id: resp!.id,
        };
        let activityId = item.activity_id;
        if (activityId) {
          const { error } = await db().from("activities").update(campos).eq("id", activityId);
          if (error) throw error;
        } else {
          const { data: nova, error } = await db()
            .from("activities")
            .insert({ ...campos, client_id: item.client_id, responsible_id: resp!.profile_id ?? ctx.profileId })
            .select("id")
            .single();
          if (error) throw error;
          activityId = nova.id;
        }
        await db()
          .from("distribuicao")
          .update({ status: "aceita", activity_id: activityId, tratado_por: ctx.profileId, tratado_em: new Date().toISOString() })
          .eq("id", item.id);
        if (item.publicacao_id)
          await db().from("publicacoes").update({ status: "tratada", activity_id: activityId, tratada_por: ctx.profileId, tratada_em: new Date().toISOString() }).eq("id", item.publicacao_id);
        return { atividade: `/admin/activities/${activityId}`, responsavel: resp!.nome };
      },
    },
    {
      name: "descartar_demanda",
      kind: "write",
      perm: ["distribuicao"],
      label: "Descartou pedido da Distribuição",
      description: "Tira pedidos da Distribuição sem criar atividade (ids de listar_distribuicao).",
      parameters: obj({ ids: { type: "array", items: { type: "string" } } }, ["ids"]),
      run: async (a, ctx) => {
        const ids = (Array.isArray(a.ids) ? a.ids : []).map(String);
        const { data, error } = await db()
          .from("distribuicao")
          .update({ status: "descartada", tratado_por: ctx.profileId, tratado_em: new Date().toISOString() })
          .in("id", ids)
          .eq("status", "pendente")
          .select("id, publicacao_id");
        if (error) throw error;
        const pubs = (data ?? []).map((d) => d.publicacao_id).filter((x): x is string => !!x);
        if (pubs.length) await db().from("publicacoes").update({ status: "descartada", tratada_por: ctx.profileId, tratada_em: new Date().toISOString() }).in("id", pubs);
        return { descartados: data?.length ?? 0 };
      },
    },

    // ───────── Agenda ─────────
    {
      name: "agenda_do_dia",
      kind: "read",
      perm: ["agenda"],
      label: "Consultou a agenda",
      description:
        "O dia de alguém: compromissos, o que vence, atrasadas e próximos 3 dias. pessoa: nome, 'eu' (padrão) ou 'todos' (só administrador). dia: AAAA-MM-DD (padrão hoje).",
      parameters: obj({ pessoa: { type: "string" }, dia: DATA }),
      run: async (a, ctx) => {
        const dia = a.dia ? String(a.dia) : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
        const alvo = termo(a.pessoa).toLowerCase();
        let pessoa: string | null;
        if (!alvo || alvo === "eu") pessoa = await meuResponsavel(ctx);
        else if (ctx.role !== "admin") throw new Error("Advogado só consulta a própria agenda.");
        else pessoa = alvo === "todos" ? null : await pessoaPorNome(a.pessoa);
        return { dia, ...(await diaDaPessoa(pessoa, dia)), tela: "/admin/agenda" };
      },
    },
    {
      name: "criar_compromisso",
      kind: "write",
      perm: ["agenda"],
      label: "Criou compromisso",
      description:
        "Marca reunião, ligação ou evento na agenda (não é atividade). Com cliente que tem grupo/número do WhatsApp na ficha, ele é lembrado 24h e 1h antes (lembrar_cliente, padrão sim). participantes: nomes da equipe (padrão: quem está usando).",
      parameters: obj(
        {
          titulo: { type: "string" },
          tipo: { type: "string", enum: ["reuniao", "audiencia", "ligacao", "evento", "outro"] },
          dia: DATA,
          hora: HORA,
          hora_fim: HORA,
          client_id: { type: "string" },
          participantes: { type: "array", items: { type: "string" } },
          local: { type: "string" },
          descricao: { type: "string" },
          lembrar_cliente: { type: "boolean" },
        },
        ["titulo", "dia", "hora"]
      ),
      run: async (a, ctx) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.dia)) || !/^\d{2}:\d{2}$/.test(String(a.hora))) throw new Error("Informe dia (AAAA-MM-DD) e hora (HH:MM).");
        const participantes = Array.isArray(a.participantes) && a.participantes.length
          ? await Promise.all(a.participantes.map((p) => pessoaPorNome(p)))
          : [await meuResponsavel(ctx)].filter((x): x is string => !!x);
        const inicio = new Date(`${a.dia}T${a.hora}:00-03:00`).toISOString();
        const fim = a.hora_fim ? new Date(`${a.dia}T${a.hora_fim}:00-03:00`).toISOString() : null;
        const lembrar = a.lembrar_cliente !== false;
        const { data, error } = await db()
          .from("compromissos")
          .insert({
            titulo: String(a.titulo).slice(0, 200),
            tipo: ["reuniao", "audiencia", "ligacao", "evento", "outro"].includes(String(a.tipo)) ? String(a.tipo) : "reuniao",
            inicio,
            fim,
            client_id: a.client_id ? String(a.client_id) : null,
            participantes,
            local: a.local ? String(a.local) : null,
            descricao: a.descricao ? String(a.descricao) : null,
            lembrar_cliente: lembrar,
            criado_por: ctx.profileId,
          })
          .select("id, tipo, titulo, inicio, local, client_id, lembrar_cliente")
          .single();
        if (error) throw error;
        const lembretes = await reagendarLembretes({ ...data, criacao: true }, ctx.profileId);
        return { id: data.id, link: `/admin/agenda/compromisso/${data.id}`, lembretes_agendados: lembretes.agendados, lembrete_por: lembretes.destino, motivo_sem_lembrete: lembretes.motivo ?? null };
      },
    },
    {
      name: "listar_compromissos",
      kind: "read",
      perm: ["agenda"],
      label: "Listou compromissos",
      description: "Compromissos (reuniões, ligações, eventos) entre duas datas. Padrão: próximos 7 dias.",
      parameters: obj({ de: DATA, ate: DATA, client_id: { type: "string" } }),
      run: async (a) => {
        const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
        const de = a.de ? String(a.de) : hoje;
        const ate = a.ate ? String(a.ate) : new Date(Date.parse(`${de}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
        let q = db()
          .from("compromissos")
          .select("id, titulo, tipo, inicio, fim, local, participantes, clients(name)")
          .gte("inicio", new Date(`${de}T00:00:00-03:00`).toISOString())
          .lte("inicio", new Date(`${ate}T23:59:59-03:00`).toISOString())
          .order("inicio");
        if (a.client_id) q = q.eq("client_id", String(a.client_id));
        const { data, error } = await q;
        if (error) throw error;
        const nomes = new Map((await listPessoas()).map((p) => [p.id, p.nome]));
        return (data ?? []).map((c) => ({
          ...c,
          quando: new Date(c.inicio).toLocaleString("pt-BR", { timeZone: "America/Bahia", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
          participantes: c.participantes.map((p) => nomes.get(p) ?? p),
          link: `/admin/agenda/compromisso/${c.id}`,
        }));
      },
    },
    {
      name: "excluir_compromisso",
      kind: "delete",
      perm: ["agenda"],
      label: "Excluiu compromisso",
      description: "Exclui um compromisso da agenda (os lembretes que ainda não saíram são cancelados).",
      parameters: obj({ id: { type: "string" } }, ["id"]),
      resumo: () => "Excluir o compromisso da agenda",
      run: async (a) => {
        const { error } = await db().from("compromissos").delete().eq("id", String(a.id));
        if (error) throw error;
        await cancelarLembretes(String(a.id));
        return { excluido: true };
      },
    },
    // ───────── Aviso ao cliente ─────────
    {
      name: "avisar_cliente_atividade_concluida",
      kind: "confirm",
      soAdmin: true,
      label: "Avisou o cliente no WhatsApp",
      description:
        "Avisa o cliente, no WhatsApp dele, que uma atividade CONCLUÍDA foi concluída (mesmo botão 'Avisar no Zap' da atividade). Sem 'texto', usa o texto padrão do escritório. Pede confirmação e marca a atividade como 'cliente avisado'.",
      parameters: obj({ id: { type: "string", description: "id da atividade" }, texto: { type: "string", description: "texto opcional; vazio = padrão do escritório" } }, ["id"]),
      descrever: async (a) => {
        try {
          const r = await montarAviso(db(), String(a.id), a.texto);
          return `Para ${r.destino.rotulo}:\n“${r.texto}”${r.avisadoEm ? "\n⚠ O cliente já foi avisado desta atividade antes." : ""}`;
        } catch (e) {
          return `⚠ ${(e as Error).message}`;
        }
      },
      run: async (a, ctx) => {
        const r = await montarAviso(db(), String(a.id), a.texto);
        const job = await enfileirarMensagem({ para: r.destino.para, texto: r.texto, origemRef: `aviso-concluida:${r.id}:${Date.now()}`, expiraEm: new Date(Date.now() + 24 * 3_600_000), criadoPor: ctx.profileId });
        if (!job) throw new Error("Não consegui colocar a mensagem na fila do WhatsApp.");
        await db().from("activities").update({ cliente_avisado_em: new Date().toISOString(), cliente_avisado_por: ctx.profileId }).eq("id", r.id);
        return { avisado: true, para: r.destino.rotulo };
      },
    },
  ];
}

/** Texto + destino do aviso "atividade concluída" (valida tudo; lança erro em português). */
async function montarAviso(db: Db, id: string, textoLivre: unknown) {
  const { data: at } = await db.from("activities").select("id, title, status, client_id, cliente_avisado_em, clients(name)").eq("id", id).maybeSingle();
  if (!at) throw new Error("Atividade não encontrada.");
  if (at.status !== "concluida") throw new Error("A atividade ainda não está concluída.");
  if (!at.client_id) throw new Error("A atividade não tem cliente.");
  const destino = await destinoDoCliente(at.client_id);
  if (!destino) throw new Error("O cliente não tem WhatsApp vinculado.");
  const nomeCliente = (at.clients as unknown as { name: string } | null)?.name ?? "";
  const texto = (String(textoLivre ?? "").trim() || (await getEscritorioConfig()).aviso_concluida).replaceAll("{titulo}", at.title).replaceAll("{cliente}", nomeCliente);
  return { id: at.id, texto, destino, avisadoEm: at.cliente_avisado_em };
}

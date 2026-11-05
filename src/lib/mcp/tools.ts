import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mcpDb, type McpIdentity } from "@/lib/mcp/oauth";
import { conferirMudancaDePrazo, ehSuperAdminId } from "@/lib/prazo-pedidos";

const MAX_CHARS = 60_000;
const uuid = z.string().uuid();
const activityStatus = z.enum(["aberta", "em_andamento", "concluida", "cancelada"]);
const activityType = z.enum(["consultoria", "processo", "contrato", "reuniao", "pesquisa", "audiencia"]);
const financialStatus = z.enum(["pending", "paid", "overdue", "cancelled"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");
const limite = z.number().int().min(1).max(200).default(50);

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

function reply(value: unknown): Result {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 1);
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS)}\n… (resposta cortada; use filtros ou paginação)`;
  return { content: [{ type: "text", text }] };
}

const fail = (message: string): Result => ({ content: [{ type: "text", text: message }], isError: true });

async function audit(who: McpIdentity, tool: string, args: unknown, ok: boolean, before?: unknown, error?: string) {
  await mcpDb()
    .from("mcp_audit_log")
    .insert({ profile_id: who.profileId, tool, args, before_snapshot: before ?? null, ok, error: error ?? null })
    .then(() => undefined, () => undefined);
}

// Escapa vírgulas/parênteses do termo de busca usado dentro de .or(...).
const term = (s: string) => s.replace(/[,()%*\\]/g, " ").trim();

export function registerTools(server: McpServer, who: McpIdentity) {
  const db = createAdminClient();

  // Envolve cada ferramenta: registra escritas/exclusões na auditoria e transforma erros em mensagem.
  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    kind: "read" | "write" | "delete",
    shape: S,
    run: (args: z.infer<z.ZodObject<S>>) => Promise<{ value: unknown; before?: unknown }>
  ) => {
    server.registerTool(
      name,
      {
        description,
        inputSchema: shape,
        annotations: {
          readOnlyHint: kind === "read",
          destructiveHint: kind === "delete",
          idempotentHint: kind === "read",
          openWorldHint: false,
        },
      },
      (async (args: z.infer<z.ZodObject<S>>) => {
        try {
          const { value, before } = await run(args);
          if (kind !== "read") await audit(who, name, args, true, before);
          return reply(value);
        } catch (e) {
          const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
          if (kind !== "read") await audit(who, name, args, false, undefined, msg);
          return fail(`Erro: ${msg}`);
        }
      }) as never
    );
  };

  const must = <T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
    if (r.error) throw new Error(r.error.message);
    if (!r.data) throw new Error(`${what} não encontrado(a).`);
    return r.data as NonNullable<T>;
  };

  // ───────── Consulta ─────────

  tool("buscar_clientes", "Lista clientes do escritório (nome, documento, e-mail, ativo). Filtre por parte do nome ou documento.", "read",
    { busca: z.string().optional(), apenas_ativos: z.boolean().default(false), limite },
    async ({ busca, apenas_ativos, limite }) => {
      let q = db.from("clients").select("id, name, tipo_pessoa, documento, email_contact, active, plan_start_date").order("name").limit(limite);
      if (busca && term(busca)) q = q.or(`name.ilike.%${term(busca)}%,documento.ilike.%${term(busca)}%`);
      if (apenas_ativos) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return { value: data };
    });

  tool("ver_cliente", "Ficha de um cliente: dados, contagens (processos, atividades abertas, documentos, contratos) e valor pendente no financeiro.", "read",
    { id: uuid },
    async ({ id }) => {
      const client = must(await db.from("clients").select("*").eq("id", id).maybeSingle(), "Cliente");
      const count = async (table: "processes" | "documents" | "contracts") =>
        (await db.from(table).select("id", { count: "exact", head: true }).eq("client_id", id)).count ?? 0;
      const [processes, documents, contracts, open, pending] = await Promise.all([
        count("processes"),
        count("documents"),
        count("contracts"),
        db.from("activities").select("id", { count: "exact", head: true }).eq("client_id", id).in("status", ["aberta", "em_andamento"]),
        db.from("financial_records").select("amount").eq("client_id", id).in("status", ["pending", "overdue"]),
      ]);
      const { drive_import_folder_ids: _ignored, ...rest } = client;
      void _ignored;
      return {
        value: {
          ...rest,
          processos: processes,
          documentos: documents,
          contratos: contracts,
          atividades_abertas: open.count ?? 0,
          financeiro_pendente_ou_atrasado: (pending.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
        },
      };
    });

  tool("listar_processos", "Lista processos (número, área, vara, fase, status).", "read",
    { client_id: uuid.optional(), busca: z.string().optional(), limite },
    async ({ client_id, busca, limite }) => {
      let q = db.from("processes").select("id, client_id, numero_processo, area, vara_tribunal, fase, status, responsible_id, clients(name)").order("created_at", { ascending: false }).limit(limite);
      if (client_id) q = q.eq("client_id", client_id);
      if (busca && term(busca)) q = q.or(`numero_processo.ilike.%${term(busca)}%,vara_tribunal.ilike.%${term(busca)}%`);
      const { data, error } = await q;
      if (error) throw error;
      return { value: data };
    });

  tool("listar_atividades", "Lista atividades do escritório (título, tipo, status, prazo). 'prazo_ate' filtra atividades com prazo até a data.", "read",
    { client_id: uuid.optional(), status: activityStatus.optional(), prazo_ate: date.optional(), limite },
    async ({ client_id, status, prazo_ate, limite }) => {
      let q = db.from("activities").select("id, client_id, title, type, status, deadline, description, responsible_id, clients(name)").order("deadline", { ascending: true, nullsFirst: false }).limit(limite);
      if (client_id) q = q.eq("client_id", client_id);
      if (status) q = q.eq("status", status);
      if (prazo_ate) q = q.lte("deadline", prazo_ate);
      const { data, error } = await q;
      if (error) throw error;
      return { value: data };
    });

  tool("listar_documentos", "Lista documentos (título, categoria, cliente, origem Drive ou portal). Paginado, 25 por página.", "read",
    { client_id: uuid.optional(), busca: z.string().optional(), categoria: z.enum(["contrato", "processo", "financeiro", "pessoal", "outros"]).optional(), pagina: z.number().int().min(1).default(1) },
    async ({ client_id, busca, categoria, pagina }) => {
      let q = db
        .from("documents")
        .select("id, client_id, title, category, process_id, activity_id, drive_file_id, created_at, clients(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id")
        .range((pagina - 1) * 25, pagina * 25 - 1);
      if (client_id) q = q.eq("client_id", client_id);
      if (categoria) q = q.eq("category", categoria);
      if (busca && term(busca)) q = q.ilike("title", `%${term(busca)}%`);
      const { data, count, error } = await q;
      if (error) throw error;
      return { value: { total: count, pagina, itens: data } };
    });

  tool("link_documento", "Devolve um link para abrir/baixar um documento (Drive: link do Drive, exige acesso à conta; portal: link temporário de 1 hora).", "read",
    { id: uuid },
    async ({ id }) => {
      const doc = must(await db.from("documents").select("id, title, file_path, drive_file_id").eq("id", id).maybeSingle(), "Documento");
      if (doc.drive_file_id) return { value: { titulo: doc.title, origem: "drive", link: `https://drive.google.com/file/d/${doc.drive_file_id}/view` } };
      const { data, error } = await db.storage.from("documents").createSignedUrl(doc.file_path, 3600);
      if (error || !data) throw new Error("Não foi possível gerar o link do arquivo.");
      return { value: { titulo: doc.title, origem: "portal", link: data.signedUrl, validade: "1 hora" } };
    });

  tool("listar_contratos", "Lista contratos (título, vigência, valor, status).", "read",
    { client_id: uuid.optional(), status: z.enum(["active", "expired", "cancelled"]).optional(), limite },
    async ({ client_id, status, limite }) => {
      let q = db.from("contracts").select("id, client_id, title, description, start_date, end_date, value, status, clients(name)").order("start_date", { ascending: false }).limit(limite);
      if (client_id) q = q.eq("client_id", client_id);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return { value: data };
    });

  tool("listar_financeiro", "Lista lançamentos financeiros e o total por status. Datas de vencimento no formato AAAA-MM-DD.", "read",
    { client_id: uuid.optional(), status: financialStatus.optional(), vencimento_de: date.optional(), vencimento_ate: date.optional(), limite },
    async ({ client_id, status, vencimento_de, vencimento_ate, limite }) => {
      let q = db.from("financial_records").select("id, client_id, description, amount, due_date, status, paid_at, payment_method, clients(name)").order("due_date", { ascending: false }).limit(limite);
      if (client_id) q = q.eq("client_id", client_id);
      if (status) q = q.eq("status", status);
      if (vencimento_de) q = q.gte("due_date", vencimento_de);
      if (vencimento_ate) q = q.lte("due_date", vencimento_ate);
      const { data, error } = await q;
      if (error) throw error;
      const totals: Record<string, number> = {};
      for (const r of data) totals[r.status] = (totals[r.status] ?? 0) + Number(r.amount);
      return { value: { total_por_status_nos_itens_listados: totals, itens: data } };
    });

  tool("listar_horas", "Lista lançamentos de horas e soma total.", "read",
    { client_id: uuid.optional(), de: date.optional(), ate: date.optional(), limite },
    async ({ client_id, de, ate, limite }) => {
      let q = db.from("time_entries").select("id, client_id, advogado_id, date, hours, activity_type, billable, description, clients(name)").order("date", { ascending: false }).limit(limite);
      if (client_id) q = q.eq("client_id", client_id);
      if (de) q = q.gte("date", de);
      if (ate) q = q.lte("date", ate);
      const { data, error } = await q;
      if (error) throw error;
      return { value: { total_horas_nos_itens_listados: data.reduce((s, r) => s + Number(r.hours), 0), itens: data } };
    });

  // ───────── Criação e edição ─────────

  tool("criar_atividade", "Cria uma atividade para um cliente. O responsável padrão é quem autorizou o Claude.", "write",
    { client_id: uuid, title: z.string().min(1).max(200), type: activityType, description: z.string().optional(), deadline: date.optional(), status: activityStatus.default("aberta"), responsible_id: uuid.optional() },
    async (a) => {
      const row = must(
        await db.from("activities").insert({ client_id: a.client_id, title: a.title, type: a.type, description: a.description ?? null, deadline: a.deadline ?? null, status: a.status, responsible_id: a.responsible_id ?? who.profileId }).select("*").single(),
        "Atividade"
      );
      return { value: row };
    });

  tool("atualizar_atividade", "Altera campos de uma atividade (só envie o que muda). Para concluir, status='concluida'.", "write",
    { id: uuid, title: z.string().min(1).max(200).optional(), type: activityType.optional(), description: z.string().nullable().optional(), deadline: date.nullable().optional(), status: activityStatus.optional(), responsible_id: uuid.optional() },
    async ({ id, ...patch }) => {
      const before = must(await db.from("activities").select("*").eq("id", id).maybeSingle(), "Atividade");
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) throw new Error("Nada para alterar.");
      // prazo travado (05/11/2026): só o admin máximo muda um prazo que já existe
      if (patch.deadline !== undefined) await conferirMudancaDePrazo(await ehSuperAdminId(who.profileId), [id], patch.deadline ?? null);
      const row = must(await db.from("activities").update(clean as never).eq("id", id).select("*").single(), "Atividade");
      return { value: row, before };
    });

  tool("lancar_horas", "Lança horas trabalhadas num cliente. O advogado padrão é quem autorizou o Claude.", "write",
    { client_id: uuid, date, hours: z.number().positive().max(24), description: z.string().min(1), activity_type: activityType, billable: z.boolean().default(true), advogado_id: uuid.optional() },
    async (a) => {
      const row = must(
        await db.from("time_entries").insert({ client_id: a.client_id, date: a.date, hours: a.hours, description: a.description, activity_type: a.activity_type, billable: a.billable, advogado_id: a.advogado_id ?? who.profileId }).select("*").single(),
        "Lançamento"
      );
      return { value: row };
    });

  tool("atualizar_horas", "Altera um lançamento de horas (só envie o que muda).", "write",
    { id: uuid, date: date.optional(), hours: z.number().positive().max(24).optional(), description: z.string().min(1).optional(), activity_type: activityType.optional(), billable: z.boolean().optional() },
    async ({ id, ...patch }) => {
      const before = must(await db.from("time_entries").select("*").eq("id", id).maybeSingle(), "Lançamento");
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) throw new Error("Nada para alterar.");
      const row = must(await db.from("time_entries").update(clean as never).eq("id", id).select("*").single(), "Lançamento");
      return { value: row, before };
    });

  tool("lancar_financeiro", "Cria um lançamento financeiro (cobrança/honorário) para um cliente. Valor em reais.", "write",
    { client_id: uuid, description: z.string().min(1), amount: z.number().positive(), due_date: date, status: financialStatus.default("pending"), payment_method: z.string().optional(), paid_at: date.optional() },
    async (a) => {
      const row = must(
        await db.from("financial_records").insert({ client_id: a.client_id, description: a.description, amount: a.amount, due_date: a.due_date, status: a.status, payment_method: a.payment_method ?? null, paid_at: a.paid_at ?? null }).select("*").single(),
        "Lançamento"
      );
      return { value: row };
    });

  tool("atualizar_financeiro", "Altera um lançamento financeiro (só envie o que muda). Para dar baixa: status='paid' e paid_at.", "write",
    { id: uuid, description: z.string().min(1).optional(), amount: z.number().positive().optional(), due_date: date.optional(), status: financialStatus.optional(), payment_method: z.string().nullable().optional(), paid_at: date.nullable().optional() },
    async ({ id, ...patch }) => {
      const before = must(await db.from("financial_records").select("*").eq("id", id).maybeSingle(), "Lançamento");
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) throw new Error("Nada para alterar.");
      const row = must(await db.from("financial_records").update(clean as never).eq("id", id).select("*").single(), "Lançamento");
      return { value: row, before };
    });

  // ───────── Exclusão (irreversível; guarda cópia no log de auditoria) ─────────

  const confirm = z.literal(true).describe("Só envie true depois de o usuário confirmar explicitamente esta exclusão.");

  const del = (name: string, what: string, table: "activities" | "time_entries" | "financial_records" | "contracts") =>
    tool(name, `Exclui ${what} de forma permanente (uma cópia fica no log de auditoria). Peça confirmação ao usuário antes.`, "delete",
      { id: uuid, confirmar: confirm },
      async ({ id }) => {
        const before = must(await db.from(table).select("*").eq("id", id).maybeSingle(), what);
        const { error } = await db.from(table).delete().eq("id", id);
        if (error) throw new Error(error.message);
        return { value: { excluido: true, registro: before }, before };
      });

  del("excluir_atividade", "uma atividade", "activities");
  del("excluir_horas", "um lançamento de horas", "time_entries");
  del("excluir_financeiro", "um lançamento financeiro", "financial_records");
  del("excluir_contrato", "um contrato", "contracts");

  tool("excluir_documento", "Exclui um documento do portal. Ele vai para a lixeira do portal (restaurável por 30 dias em Lixeira). O arquivo no Google Drive nunca é tocado (e pode voltar na próxima sincronização, a menos que a pasta seja desligada). Peça confirmação ao usuário antes.", "delete",
    { id: uuid, confirmar: confirm },
    async ({ id }) => {
      const before = must(await db.from("documents").select("*").eq("id", id).maybeSingle(), "Documento");
      // o gatilho do banco guarda na lixeira; o arquivo físico fica
      const { error } = await db.from("documents").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return {
        value: {
          excluido: true,
          titulo: before.title,
          na_lixeira: true,
          aviso: before.drive_file_id
            ? "Foi para a lixeira do portal (30 dias). O arquivo continua no Google Drive; pode ser trazido de novo na próxima sincronização."
            : "Foi para a lixeira do portal e pode ser restaurado por 30 dias.",
        },
        before,
      };
    });
}

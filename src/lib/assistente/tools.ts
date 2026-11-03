import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { PermChave, Permissoes } from "@/lib/permissoes";
import { mcpDb } from "@/lib/mcp/oauth";
import { idsHandoff, secoesHandoff, handoffParaTexto, type HandoffAnswers } from "@/lib/handoff-schema";
import { gerarRelatorioMensal, MESES } from "@/lib/relatorio";
import { gerarDemandasDoCliente } from "@/lib/demandas";
import { bytesToParts, documentToParts } from "@/lib/document-content";
import { downloadFile, getDriveFileMeta, getDriveSession, listFolderFiles, searchDriveFiles } from "@/lib/google-drive";
import { getHandoff } from "@/lib/data/handoff";
import { GoogleGenAI } from "@google/genai";
import { MODELOS } from "@/lib/ia-modelos";
import { TOOLS_WHATSAPP } from "./tools-whatsapp";
import { TOOLS_TRANSCRICAO } from "./tools-transcricao";
import { TOOLS_ATAS } from "./tools-atas";
import { TOOLS_INDICADORES } from "./tools-indicadores";
import { TOOLS_ROTINAS } from "./tools-rotinas";
import { TOOLS_PROCESSOS_BUSCA } from "./tools-processos-busca";
import { toolsRedesenho } from "./tools-redesenho";
import { toolsMarcas } from "./tools-marcas";
import { TOOLS_PAINEL } from "./tools-painel";
import { toolsOperacao } from "./tools-operacao";
import { toolsCobranca } from "./tools-cobranca";
import { envolvidosPorNome, etiquetasPorNome, toolsSistema } from "./tools-sistema";
import { reagendarAudienciaDaAtividade } from "@/lib/zap/lembretes";

// Ferramentas do assistente do portal (balão de chat com Gemini). Mesma
// lógica das ferramentas do servidor MCP (src/lib/mcp/tools.ts), adaptada
// para function calling do Gemini. Regras:
//  - "read": consulta, roda direto.
//  - "write": cria/altera, roda direto e fica no log de auditoria.
//  - "delete": NUNCA roda direto; o portal mostra um cartão "Confirmar?" e
//    só executa quando a pessoa clica (ver app/api/assistente).
//  - "confirm": idem, para envios no WhatsApp (cartão "Confirma o envio?").
//  - "atencao": idem, para mudanças sensíveis (papel/acesso de alguém).

export type Kind = "read" | "write" | "delete" | "confirm" | "atencao";
export type Ctx = { profileId: string; role: "admin" | "advogado"; permissoes: Permissoes; superAdmin?: boolean };
export type ToolDef = {
  name: string;
  kind: Kind;
  /** permissões exigidas (advogado sem elas nem vê a ferramenta) */
  perm?: PermChave[];
  /** só o admin vê/usa (ex.: WhatsApp do escritório) */
  soAdmin?: boolean;
  /** só o admin máximo (rotinas dos outros, equipe, permissões) */
  soSuper?: boolean;
  label: string; // como aparece na conversa ("Buscou clientes")
  description: string;
  parameters: Record<string, unknown>;
  resumo?: (args: Record<string, unknown>) => string; // texto do cartão de confirmação
  descrever?: (args: Record<string, unknown>) => Promise<string>; // idem, quando precisa consultar o banco
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
};

const STATUS = ["aberta", "em_andamento", "concluida", "cancelada"];
const TIPOS = ["consultoria", "processo", "contrato", "reuniao", "pesquisa"];
const DATA = { type: "string", description: "Data no formato AAAA-MM-DD" };
const MAX_CHARS = 30_000;

const termo = (s: unknown) => String(s ?? "").replace(/[,()%*\\]/g, " ").trim();
// Cada execução roda com o banco de quem pediu (ver executar): admin com a
// chave de serviço; advogado com a sessão dele, então as regras do banco
// limitam tudo aos clientes designados a ele.
const bancoDaVez = new AsyncLocalStorage<SupabaseClient<Database>>();
const db = (): SupabaseClient<Database> => {
  const b = bancoDaVez.getStore();
  if (!b) throw new Error("Ferramenta fora de execução.");
  return b;
};

/** Advogado só lê/registra arquivo do Drive que esteja no portal ou na pasta de um cliente dele. */
async function arquivoDoDrivePermitido(ctx: Ctx, token: string, fileId: string): Promise<boolean> {
  if (ctx.role === "admin") return true;
  const doc = await db().from("documents").select("id").eq("drive_file_id", fileId).limit(1);
  if (doc.data?.length) return true;
  const { data: clientes } = await db().from("clients").select("drive_folder_id").not("drive_folder_id", "is", null);
  for (const c of clientes ?? []) {
    const arquivos = await listFolderFiles(token, c.drive_folder_id!, 3, 600);
    if (arquivos.some((f) => f.id === fileId)) return true;
  }
  return false;
}

/** Responsável pelo nome ou e-mail (qualquer pessoa da equipe, mesmo de fora da empresa). */
async function responsavelPorNome(alvo: unknown): Promise<string | null> {
  const t = termo(alvo);
  if (!t) return null;
  const { data } = await createAdminClient().from("responsaveis").select("id, nome, email").or(`nome.ilike.%${t}%,email.ilike.%${t}%`).limit(5);
  if (!data?.length) throw new Error(`Não achei "${t}" entre os responsáveis da equipe.`);
  const exato = data.find((r) => r.nome.toLowerCase() === t.toLowerCase());
  if (!exato && data.length > 1) throw new Error(`Há mais de um responsável parecido com "${t}": ${data.map((r) => r.nome).join(", ")}. Diga qual.`);
  return (exato ?? data[0]).id;
}
const RESPONSAVEL = { type: "string", description: "Nome ou e-mail de quem fica responsável (qualquer pessoa da equipe, mesmo que não cuide dessa empresa). Vazio = quem está usando." };

function obj(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required };
}

/** Campos do cadastro PF enviados pelo assistente (só os informados). */
function camposPF(a: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["apelido", "estado_civil", "profissao", "rg", "ctps", "pis", "titulo_eleitor", "cnh", "nome_pai", "nome_mae", "naturalidade", "nacionalidade", "comentarios"])
    if (typeof a[k] === "string" && (a[k] as string).trim()) out[k] = (a[k] as string).trim();
  if (typeof a.nascimento === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.nascimento)) out.nascimento = a.nascimento;
  if (Array.isArray(a.telefones)) {
    out.telefones = a.telefones.map(String).filter((t) => t.replace(/\D/g, "").length >= 8);
    out.whatsapp_numeros = (out.telefones as string[]).map((t) => t.replace(/[^\d+]/g, ""));
  }
  if (a.endereco && typeof a.endereco === "object") out.endereco = a.endereco;
  return out;
}

async function porId<T>(tabela: "clients" | "activities" | "documents", id: unknown, oque: string): Promise<T> {
  const { data, error } = await db().from(tabela).select("*").eq("id", String(id)).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${oque} não encontrado(a).`);
  return data as T;
}


const TIPO_DRIVE: Record<string, string> = {
  "application/vnd.google-apps.document": "Documento Google",
  "application/vnd.google-apps.spreadsheet": "Planilha Google",
  "application/vnd.google-apps.presentation": "Apresentação Google",
  "application/vnd.google-apps.form": "Formulário Google (não dá para ler o conteúdo)",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
};
const NAO_LEGIVEIS = ["application/vnd.google-apps.form", "application/vnd.google-apps.folder", "application/vnd.google-apps.shortcut", "application/vnd.google-apps.site", "application/vnd.google-apps.map"];
const tipoDrive = (mime: string) => TIPO_DRIVE[mime] ?? (mime.startsWith("image/") ? "Imagem" : mime.split("/").pop() ?? mime);
const legivel = (mime: string) => !NAO_LEGIVEIS.includes(mime);


// Anexos do chat ficam em internal/chat/{profileId}/{uuid}-{nome} (pasta interna,
// apagada após 7 dias se não forem guardados num cliente).
export const PREFIXO_ANEXOS = "internal/chat";
function validarAnexo(caminho: string, ctx: Ctx): string {
  const limpo = caminho.trim().replace(/^anexo=/, "");
  if (!limpo.startsWith(`${PREFIXO_ANEXOS}/${ctx.profileId}/`) || limpo.includes("..")) throw new Error("Anexo inválido.");
  return limpo;
}
function mimePorNome(nome: string, tipo: string): string {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  // o Windows costuma mandar .csv como application/vnd.ms-excel: vale a extensão
  if (ext === "csv") return "text/csv";
  if (tipo && tipo !== "application/octet-stream") return tipo;
  const m: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    heic: "image/heic",
  };
  return m[ext] ?? tipo;
}

export const TOOLS: ToolDef[] = [
  // ───────── consulta ─────────
  {
    name: "buscar_clientes",
    kind: "read",
    label: "Buscou clientes",
    description: "Lista clientes (id, nome, documento). Use para achar o id de um cliente citado pelo nome.",
    parameters: obj({ busca: { type: "string" }, apenas_ativos: { type: "boolean" }, arquivados: { type: "boolean", description: "true = listar só os arquivados" } }),
    run: async (a) => {
      let q = db().from("clients").select("id, name, documento, active").order("name").limit(30);
      if (termo(a.busca)) q = q.or(`name.ilike.%${termo(a.busca)}%,documento.ilike.%${termo(a.busca)}%`);
      if (a.apenas_ativos) q = q.eq("active", true);
      q = a.arquivados ? q.not("archived_at", "is", null) : q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
  {
    name: "ver_cliente",
    kind: "read",
    label: "Abriu a ficha do cliente",
    description: "Ficha do cliente: dados, Ficha de Handoff em texto e contagens.",
    parameters: obj({ client_id: { type: "string" } }, ["client_id"]),
    run: async (a, ctx) => {
      const c = await porId<{ id: string; name: string } & Record<string, unknown>>("clients", a.client_id, "Cliente");
      const id = c.id;
      const n = async (t: "documents" | "onboardings" | "monthly_reports" | "processes", extra?: (q: never) => never) => {
        let q = db().from(t).select("id", { count: "exact", head: true }).eq("client_id", id);
        if (extra) q = extra(q as never);
        return (await q).count ?? 0;
      };
      const ativ = await db().from("activities").select("status").eq("client_id", id);
      const porStatus: Record<string, number> = {};
      for (const r of ativ.data ?? []) porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
      const { handoff: _h, triagem: _t, drive_import_folder_ids: _x, ...dados } = c;
      void _h;
      void _t;
      void _x;
      const fichaCliente = ctx.permissoes.ficha_handoff ? await getHandoff(id, db()) : { handoff: null, triagem: null };
      return {
        ...dados,
        ficha_de_handoff: ctx.permissoes.ficha_handoff ? handoffParaTexto(fichaCliente.handoff, fichaCliente.triagem) || "(não preenchida)" : "(sem permissão)",
        atividades_por_status: porStatus,
        documentos: await n("documents"),
        atas: (await db().from("documents").select("id", { count: "exact", head: true }).eq("client_id", id).eq("category", "ata")).count ?? 0,
        onboardings: await n("onboardings"),
        relatorios: await n("monthly_reports"),
        processos: await n("processes"),
        link_no_portal: `/admin/clients/${id}`,
      };
    },
  },
  {
    name: "listar_atividades",
    kind: "read",
    label: "Consultou atividades",
    description: "Lista atividades (id, título, status, prazo, cliente). Filtros: client_id, status, prazo_ate, busca, arquivadas.",
    parameters: obj({
      client_id: { type: "string" },
      status: { type: "string", enum: STATUS },
      prazo_ate: DATA,
      busca: { type: "string" },
      arquivadas: { type: "boolean", description: "true = listar só as arquivadas" },
    }),
    run: async (a) => {
      let q = db().from("activities").select("id, client_id, title, status, deadline, clients(name)").order("deadline", { ascending: true, nullsFirst: false }).limit(40);
      if (a.client_id) q = q.eq("client_id", String(a.client_id));
      if (a.status) q = q.eq("status", String(a.status) as never);
      if (a.prazo_ate) q = q.lte("deadline", String(a.prazo_ate));
      if (termo(a.busca)) q = q.ilike("title", `%${termo(a.busca)}%`);
      q = a.arquivadas ? q.not("archived_at", "is", null) : q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
  {
    name: "listar_documentos",
    perm: ["documentos"],
    kind: "read",
    label: "Procurou documentos",
    description: "Lista documentos do portal (inclui os vindos do Drive). Busca por título; categoria 'ata' = ATAs.",
    parameters: obj({
      client_id: { type: "string" },
      busca: { type: "string" },
      categoria: { type: "string", enum: ["contrato", "processo", "financeiro", "pessoal", "outros", "ata"] },
    }),
    run: async (a, ctx) => {
      let q = db().from("documents").select("id, client_id, title, category, drive_file_id, meeting_date, clients(name)").order("created_at", { ascending: false }).limit(25);
      if (!ctx.permissoes.atas) q = q.neq("category", "ata");
      if (a.client_id) q = q.eq("client_id", String(a.client_id));
      if (a.categoria) q = q.eq("category", String(a.categoria) as never);
      if (termo(a.busca)) q = q.ilike("title", `%${termo(a.busca)}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data.map((d) => ({ ...d, no_drive: !!d.drive_file_id, drive_file_id: undefined }));
    },
  },
  {
    name: "link_documento",
    perm: ["documentos"],
    kind: "read",
    label: "Gerou link do documento",
    description: "Link para abrir/baixar um documento do portal.",
    parameters: obj({ document_id: { type: "string" } }, ["document_id"]),
    run: async (a, ctx) => {
      const d = await porId<{ title: string; file_path: string; drive_file_id: string | null; category: string }>("documents", a.document_id, "Documento");
      if (d.category === "ata" && !ctx.permissoes.atas) throw new Error("Você não tem permissão para ATAs.");
      if (d.drive_file_id) return { titulo: d.title, link: `https://drive.google.com/file/d/${d.drive_file_id}/view` };
      const { data, error } = await db().storage.from("documents").createSignedUrl(d.file_path, 3600);
      if (error || !data) throw new Error("Não foi possível gerar o link do arquivo.");
      return { titulo: d.title, link: data.signedUrl, validade: "1 hora" };
    },
  },
  {
    name: "listar_processos",
    perm: ["processos"],
    kind: "read",
    label: "Consultou processos",
    description: "Lista processos (número, área, vara, fase, cliente).",
    parameters: obj({ client_id: { type: "string" }, busca: { type: "string" } }),
    run: async (a) => {
      let q = db().from("processes").select("id, client_id, numero_processo, area, vara_tribunal, fase, status, clients(name)").order("created_at", { ascending: false }).limit(50);
      if (a.client_id) q = q.eq("client_id", String(a.client_id));
      if (termo(a.busca)) q = q.or(`numero_processo.ilike.%${termo(a.busca)}%,vara_tribunal.ilike.%${termo(a.busca)}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
  {
    name: "listar_relatorios",
    perm: ["relatorios"],
    kind: "read",
    label: "Consultou relatórios",
    description: "Lista relatórios mensais gerados (cliente, mês/ano, enviado ou não).",
    parameters: obj({ client_id: { type: "string" } }),
    run: async (a) => {
      let q = db().from("monthly_reports").select("id, client_id, reference_month, reference_year, sent_at, created_at, clients(name)").order("reference_year", { ascending: false }).order("reference_month", { ascending: false }).limit(40);
      if (a.client_id) q = q.eq("client_id", String(a.client_id));
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },

  // ───────── criação e edição ─────────
  {
    name: "criar_atividade",
    kind: "write",
    label: "Criou atividade",
    description: "Cria uma atividade. Com cliente: ache o client_id com buscar_clientes. SEM cliente (tarefa interna do escritório): omita client_id. Responsável: quem está usando, ou o informado em responsavel.",
    parameters: obj(
      {
        client_id: { type: "string" },
        title: { type: "string" },
        type: { type: "string", enum: TIPOS },
        description: { type: "string" },
        deadline: DATA,
        status: { type: "string", enum: STATUS },
        hora: { type: "string", description: "Horário HH:MM (opcional)" },
        categoria: { type: "string", enum: ["tarefa", "prazo", "audiencia"] },
        envolvidos: { type: "array", items: { type: "string" }, description: "Nomes de outras pessoas da equipe envolvidas" },
        etiquetas: { type: "array", items: { type: "string" }, description: "Nomes das etiquetas (cria as que não existem)" },
        responsavel: RESPONSAVEL,
      },
      ["title", "type"]
    ),
    run: async (a, ctx) => {
      if (a.client_id) await porId("clients", a.client_id, "Cliente");
      const { data, error } = await db()
        .from("activities")
        .insert({
          client_id: a.client_id ? String(a.client_id) : null,
          title: String(a.title).slice(0, 200),
          type: String(a.type) as never,
          description: a.description ? String(a.description) : null,
          deadline: a.deadline ? String(a.deadline) : null,
          status: (a.status ? String(a.status) : "aberta") as never,
          responsible_id: ctx.profileId,
          ...(a.responsavel ? { responsavel_id: await responsavelPorNome(a.responsavel) } : {}),
          ...(await camposExtras(a)),
        })
        .select("id, title, deadline, status")
        .single();
      if (error) throw error;
      await reagendarAudienciaDaAtividade(data.id, { criacao: true, criadoPor: ctx.profileId }).catch(() => undefined);
      return { ...data, link_no_portal: `/admin/activities/${data.id}` };
    },
  },
  {
    name: "atualizar_atividade",
    kind: "write",
    label: "Atualizou atividade",
    description: "Altera uma atividade (só o que muda). Concluir: status='concluida'. Tirar prazo: deadline ''.",
    parameters: obj(
      {
        activity_id: { type: "string" },
        title: { type: "string" },
        type: { type: "string", enum: TIPOS },
        description: { type: "string" },
        deadline: DATA,
        status: { type: "string", enum: STATUS },
        hora: { type: "string", description: "Horário HH:MM (opcional)" },
        categoria: { type: "string", enum: ["tarefa", "prazo", "audiencia"] },
        envolvidos: { type: "array", items: { type: "string" }, description: "Nomes de outras pessoas da equipe envolvidas" },
        etiquetas: { type: "array", items: { type: "string" }, description: "Nomes das etiquetas (cria as que não existem)" },
        responsavel: RESPONSAVEL,
      },
      ["activity_id"]
    ),
    run: async (a) => {
      await porId("activities", a.activity_id, "Atividade");
      const patch: Record<string, unknown> = {};
      for (const k of ["title", "type", "description", "status"]) if (a[k] !== undefined) patch[k] = a[k];
      if (a.responsavel) patch.responsavel_id = await responsavelPorNome(a.responsavel);
      if (a.deadline !== undefined) patch.deadline = a.deadline ? String(a.deadline) : null;
      Object.assign(patch, await camposExtras(a));
      if (!Object.keys(patch).length) throw new Error("Nada para alterar.");
      const { data, error } = await db().from("activities").update(patch as never).eq("id", String(a.activity_id)).select("id, title, status, deadline").single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "atualizar_atividades_em_massa",
    kind: "write",
    label: "Atualizou várias atividades",
    description: "Muda status e/ou prazo de várias atividades (lista de ids).",
    parameters: obj(
      { activity_ids: { type: "array", items: { type: "string" } }, status: { type: "string", enum: STATUS }, deadline: DATA },
      ["activity_ids"]
    ),
    run: async (a) => {
      const ids = (a.activity_ids as string[]).slice(0, 200);
      const patch: Record<string, unknown> = {};
      if (a.status) patch.status = a.status;
      if (a.deadline !== undefined) patch.deadline = a.deadline ? String(a.deadline) : null;
      if (!ids.length || !Object.keys(patch).length) throw new Error("Informe as atividades e o que mudar.");
      const { data, error } = await db().from("activities").update(patch as never).in("id", ids).select("id");
      if (error) throw error;
      return { atualizadas: data.length };
    },
  },
  {
    name: "criar_cliente",
    kind: "write",
    label: "Cadastrou cliente",
    description:
      "Cadastra cliente. Empresa (PJ): documento (CNPJ) e email_contact obrigatórios. Pessoa física (PF, aba Pessoas): só o nome é obrigatório; CPF, e-mail, telefones e os dados do cadastro (como no Astrea) são opcionais. Depois sugira a Ficha de Handoff (a da PF é diferente: o caso).",
    parameters: obj(
      { name: { type: "string" }, tipo_pessoa: { type: "string", enum: ["PF", "PJ"] }, documento: { type: "string" }, email_contact: { type: "string" }, ...{ apelido: { type: "string" }, nascimento: { type: "string", description: "AAAA-MM-DD" }, estado_civil: { type: "string" }, profissao: { type: "string" }, rg: { type: "string" }, ctps: { type: "string" }, pis: { type: "string" }, titulo_eleitor: { type: "string" }, cnh: { type: "string" }, nome_pai: { type: "string" }, nome_mae: { type: "string" }, naturalidade: { type: "string" }, nacionalidade: { type: "string" }, comentarios: { type: "string" }, telefones: { type: "array", items: { type: "string" } }, endereco: { type: "object", description: "{cep, logradouro, numero, complemento, bairro, cidade, uf}" } } },
      ["name", "tipo_pessoa"]
    ),
    run: async (a) => {
      // id gerado aqui e sem pedir a linha de volta: cliente criado por advogado
      // só fica visível para ele depois do gatilho que o designa (fim do comando)
      const id = crypto.randomUUID();
      const nome = String(a.name).trim();
      const pf = a.tipo_pessoa === "PF";
      if (!pf && (!a.documento || !a.email_contact)) throw new Error("Empresa precisa de CNPJ e e-mail.");
      const doc = a.documento ? String(a.documento).trim() : null;
      const { error } = await db()
        .from("clients")
        .insert({
          id,
          name: nome,
          tipo_pessoa: pf ? "PF" : "PJ",
          documento: doc ? doc.replace(/\D/g, "") || doc : null,
          email_contact: a.email_contact ? String(a.email_contact).trim() : null,
          ...(pf ? camposPF(a) : {}),
        } as never);
      if (error) throw new Error(error.code === "23505" ? "Já existe um cliente com esse CPF/CNPJ." : error.message);
      return { id, name: nome, link_ficha: `/admin/clients/${id}`, link_handoff: `/admin/clients/${id}/handoff` };
    },
  },
  {
    name: "atualizar_cliente",
    perm: ["editar_cliente"],
    kind: "write",
    label: "Atualizou cliente",
    description: "Altera dados de um cliente (só o que muda): nome, e-mail, documento, ativo e, na pessoa física, os campos do cadastro (apelido, nascimento, estado civil, profissão, RG, telefones, endereço etc.).",
    parameters: obj({ client_id: { type: "string" }, name: { type: "string" }, email_contact: { type: "string" }, documento: { type: "string" }, active: { type: "boolean" }, ...{ apelido: { type: "string" }, nascimento: { type: "string", description: "AAAA-MM-DD" }, estado_civil: { type: "string" }, profissao: { type: "string" }, rg: { type: "string" }, ctps: { type: "string" }, pis: { type: "string" }, titulo_eleitor: { type: "string" }, cnh: { type: "string" }, nome_pai: { type: "string" }, nome_mae: { type: "string" }, naturalidade: { type: "string" }, nacionalidade: { type: "string" }, comentarios: { type: "string" }, telefones: { type: "array", items: { type: "string" } }, endereco: { type: "object", description: "{cep, logradouro, numero, complemento, bairro, cidade, uf}" } } }, ["client_id"]),
    run: async (a) => {
      const c = await porId<{ tipo_pessoa: string }>("clients", a.client_id, "Cliente");
      const patch: Record<string, unknown> = c.tipo_pessoa === "PF" ? camposPF(a) : {};
      for (const k of ["name", "email_contact", "documento", "active"]) if (a[k] !== undefined) patch[k] = a[k];
      if (!Object.keys(patch).length) throw new Error("Nada para alterar.");
      const { data, error } = await db().from("clients").update(patch as never).eq("id", String(a.client_id)).select("id, name, email_contact, active").single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "abrir_tela",
    kind: "read",
    label: "Abriu uma tela",
    description: "Leva a pessoa a uma tela: /admin, /admin/agenda, /admin/agenda/compromisso/novo, /admin/distribuicao (?origem=whatsapp|portal_cliente|publicacao), /admin/publicacoes, /admin/team, /admin/clients, /admin/clients/{id}?aba=atividades|documentos|atas|onboarding|demandas|relatorios|acesso, /admin/clients/{id}/handoff, /admin/activities, /admin/documents, /admin/onboarding/new?clientId={id}, /admin/reports, /admin/lixeira, /admin/painel (Painel do Dono, só admin máximo).",
    parameters: obj({ caminho: { type: "string" } }, ["caminho"]),
    run: async (a) => {
      const c = String(a.caminho);
      if (!c.startsWith("/admin")) throw new Error("Só é possível abrir telas do painel (/admin...).");
      return { navegar_para: c };
    },
  },


  // ───────── ações maiores ─────────
  {
    name: "ler_documento",
    perm: ["documentos"],
    kind: "read",
    label: "Leu o documento",
    description: "Lê o conteúdo de um documento/ATA do portal e responde à pergunta (ou resume).",
    parameters: obj({ document_id: { type: "string" }, pergunta: { type: "string" } }, ["document_id"]),
    run: async (a, ctx) => {
      const d = await porId<{ id: string; title: string; file_path: string; drive_file_id: string | null; category: string }>("documents", a.document_id, "Documento");
      if (d.category === "ata" && !ctx.permissoes.atas) throw new Error("Você não tem permissão para ATAs.");
      const partes = await documentToParts(d, "DOCUMENTO");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const pergunta = a.pergunta ? String(a.pergunta) : "Resuma os pontos principais em tópicos curtos (fatos, valores, prazos, obrigações, combinados).";
      const r = await ai.models.generateContent({
        model: MODELOS.leitura,
        contents: [{ role: "user", parts: [...partes, { text: `Pergunta sobre o documento "${d.title}": ${pergunta}\nResponda em português, só com o que está no documento; se não estiver lá, diga isso.` }] }],
      });
      return { documento: d.title, resposta: r.text ?? "(sem resposta)" };
    },
  },
  {
    name: "gerar_relatorio",
    perm: ["relatorios"],
    kind: "write",
    label: "Gerou relatório",
    description: "Gera/substitui o relatório mensal em PDF do cliente (mes 1-12). Não envia e-mail.",
    parameters: obj({ client_id: { type: "string" }, mes: { type: "integer" }, ano: { type: "integer" } }, ["client_id", "mes", "ano"]),
    run: async (a, ctx) => {
      const c = await porId<{ id: string; name: string }>("clients", a.client_id, "Cliente");
      const r = await gerarRelatorioMensal(db(), { clientId: c.id, clientName: c.name, mes: Number(a.mes), ano: Number(a.ano), profileId: ctx.profileId });
      if (!r.ok) throw new Error(r.error);
      return { gerado: `${MESES[Number(a.mes)]} de ${a.ano}`, cliente: c.name, link_no_portal: `/admin/clients/${c.id}?aba=arquivos` };
    },
  },
  {
    name: "gerar_demandas",
    perm: ["demandas", "gerar_ia"],
    kind: "write",
    label: "Gerou demandas",
    description: "Gera 8-12 rascunhos de demandas para aprovação (aba Demandas; substituem os não revisados). Fontes: ficha (padrão), ata_ids, onboarding_ids, instrucoes. Leva ~10s.",
    parameters: obj(
      {
        client_id: { type: "string" },
        usar_ficha: { type: "boolean" },
        ata_ids: { type: "array", items: { type: "string" } },
        onboarding_ids: { type: "array", items: { type: "string" } },
        instrucoes: { type: "string" },
        responsavel: RESPONSAVEL,
      },
      ["client_id"]
    ),
    run: async (a, ctx) => {
      const c = await porId<{ id: string; name: string }>("clients", a.client_id, "Cliente");
      const responsavelId = a.responsavel
        ? await responsavelPorNome(a.responsavel)
        : (await createAdminClient().from("responsaveis").select("id").eq("profile_id", ctx.profileId).maybeSingle()).data?.id ?? null;
      const r = await gerarDemandasDoCliente(db(), {
        responsavelId,
        client: c,
        ficha: await getHandoff(c.id, db()),
        profileId: ctx.profileId,
        usarFicha: a.usar_ficha !== false,
        ataIds: ((a.ata_ids as string[]) ?? []).filter(Boolean),
        onboardingIds: ((a.onboarding_ids as string[]) ?? []).filter(Boolean),
        instrucoes: a.instrucoes ? String(a.instrucoes) : "",
      });
      if (!r.ok) throw new Error(r.error);
      return { rascunhos_gerados: r.geradas, titulos: r.titulos, revisar_em: `/admin/clients/${c.id}?aba=demandas` };
    },
  },
  {
    name: "campos_da_ficha_handoff",
    perm: ["ficha_handoff"],
    kind: "read",
    label: "Consultou os campos da ficha",
    description: "Lista os campos da Ficha de Handoff (id, tipo e opções válidas). Empresa e pessoa física têm fichas diferentes: tipo PJ (padrão) ou PF. Use antes de preencher_ficha_handoff.",
    parameters: obj({ tipo: { type: "string", enum: ["PJ", "PF"] } }),
    run: async (a) =>
      secoesHandoff(a.tipo === "PF" ? "PF" : "PJ").flatMap((sec) =>
        sec.fields.map((f) => ({
          id: f.id,
          campo: f.label,
          tipo: f.type,
          ...("options" in f ? { opcoes: f.options } : f.type === "yesno" ? { opcoes: ["Sim", "Não"] } : {}),
          ...(f.type === "multi" && f.outro ? { texto_livre_extra: `${f.id}_outro` } : {}),
          ...(f.type === "yesno" && f.detalhe ? { detalhe_se_sim: f.detalhe.id } : {}),
        }))
      ),
  },
  {
    name: "preencher_ficha_handoff",
    perm: ["ficha_handoff"],
    kind: "write",
    label: "Preencheu a ficha de handoff",
    description: "Preenche/atualiza campos da Ficha de Handoff (só os enviados). 'campos' = {id_do_campo: valor}. Antes, consulte os ids e opções com campos_da_ficha_handoff.",
    parameters: obj({ client_id: { type: "string" }, campos: { type: "object" } }, ["client_id", "campos"]),
    run: async (a) => {
      const c = await porId<{ id: string; tipo_pessoa: "PF" | "PJ" }>("clients", a.client_id, "Cliente");
      const permitidos = idsHandoff(c.tipo_pessoa);
      const atual = (await getHandoff(c.id, db())).handoff ?? {};
      const novos: HandoffAnswers = {};
      const ignorados: string[] = [];
      for (const [k, v] of Object.entries((a.campos as Record<string, unknown>) ?? {})) {
        if (!permitidos.has(k)) {
          ignorados.push(k);
          continue;
        }
        if (Array.isArray(v)) novos[k] = v.map(String).filter(Boolean);
        else if (v !== null && v !== undefined && String(v).trim()) novos[k] = String(v).trim();
      }
      if (!Object.keys(novos).length) throw new Error("Nenhum campo válido para preencher.");
      const { error } = await db()
        .from("client_handoffs")
        .upsert({ client_id: c.id, handoff: { ...atual, ...novos }, handoff_updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      if (error) throw error;
      return { preenchidos: Object.keys(novos), ignorados, link: `/admin/clients/${c.id}/handoff` };
    },
  },
  {
    name: "arquivar_atividades",
    kind: "write",
    label: "Arquivou atividades",
    description: "Arquiva (ou desarquiva) atividades: some da lista, pode voltar.",
    parameters: obj({ activity_ids: { type: "array", items: { type: "string" } }, desarquivar: { type: "boolean" } }, ["activity_ids"]),
    run: async (a) => {
      const ids = ((a.activity_ids as string[]) ?? []).slice(0, 200);
      if (!ids.length) throw new Error("Informe as atividades.");
      const { data, error } = await db().from("activities").update({ archived_at: a.desarquivar ? null : new Date().toISOString() }).in("id", ids).select("id");
      if (error) throw error;
      return { [a.desarquivar ? "desarquivadas" : "arquivadas"]: data.length };
    },
  },
  {
    name: "arquivar_cliente",
    perm: ["editar_cliente"],
    kind: "write",
    label: "Arquivou cliente",
    description: "Arquiva (ou desarquiva) um cliente.",
    parameters: obj({ client_id: { type: "string" }, desarquivar: { type: "boolean" } }, ["client_id"]),
    run: async (a) => {
      const c = await porId<{ id: string; name: string }>("clients", a.client_id, "Cliente");
      const { error } = await db().from("clients").update({ archived_at: a.desarquivar ? null : new Date().toISOString() }).eq("id", c.id);
      if (error) throw error;
      return { cliente: c.name, arquivado: !a.desarquivar };
    },
  },

    // ───────── Google Drive ─────────
  // (tipo legível + se dá para ler o conteúdo)
  {
    name: "buscar_no_drive",
    kind: "read",
    label: "Procurou no Google Drive",
    description: "Procura arquivos no Google Drive do escritório (inclusive fora do portal). Com client_id, só na pasta do cliente; no_conteudo=true busca também no texto de dentro. Sem busca, lista os recentes. Prefira os 'legivel' para ler.",
    parameters: obj({ busca: { type: "string" }, client_id: { type: "string" }, no_conteudo: { type: "boolean" } }),
    run: async (a, ctx) => {
      const sessao = await getDriveSession();
      if (!sessao) throw new Error("O Google Drive não está conectado (Integrações).");
      const termo = String(a.busca ?? "").trim();
      if (!a.client_id && ctx.role !== "admin") throw new Error("Informe o cliente: você só pode procurar na pasta do Drive dos seus clientes.");
      if (a.client_id) {
        const c = await porId<{ name: string; drive_folder_id: string | null }>("clients", a.client_id, "Cliente");
        if (!c.drive_folder_id) throw new Error(`O cliente ${c.name} não tem pasta do Drive ligada.`);
        const arquivos = await listFolderFiles(sessao.token, c.drive_folder_id, 3, 600);
        const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const achados = termo ? arquivos.filter((f) => norm(`${f.path} ${f.name}`).includes(norm(termo))) : arquivos;
        return achados
          .sort((x, y) => (y.modifiedTime ?? "").localeCompare(x.modifiedTime ?? ""))
          .slice(0, 30)
          .map((f) => ({ file_id: f.id, nome: f.name, tipo: tipoDrive(f.mimeType), legivel: legivel(f.mimeType), pasta: f.path || "(raiz da pasta do cliente)", modificado: f.modifiedTime, link: f.webViewLink }));
      }
      const achados = await searchDriveFiles(sessao.token, termo, { conteudo: a.no_conteudo === true, max: 25 });
      return achados.map((f) => ({ file_id: f.id, nome: f.name, tipo: tipoDrive(f.mimeType), legivel: legivel(f.mimeType), modificado: f.modifiedTime, link: f.webViewLink }));
    },
  },
  {
    name: "ler_arquivo_drive",
    kind: "read",
    label: "Leu arquivo do Drive",
    description: "Lê o conteúdo de um arquivo do Drive (file_id) e responde à pergunta (ou resume).",
    parameters: obj({ file_id: { type: "string" }, pergunta: { type: "string" } }, ["file_id"]),
    run: async (a, ctx) => {
      const sessao = await getDriveSession();
      if (!sessao) throw new Error("O Google Drive não está conectado (Integrações).");
      if (!(await arquivoDoDrivePermitido(ctx, sessao.token, String(a.file_id)))) throw new Error("Esse arquivo não é de um cliente seu.");
      const meta = await getDriveFileMeta(sessao.token, String(a.file_id));
      if (meta && !legivel(meta.mimeType)) {
        throw new Error(`"${meta.name}" é um ${tipoDrive(meta.mimeType).replace(/ \(.*\)$/, "")}: o Google não deixa ler o conteúdo dele. Se for um formulário, as respostas ficam na planilha ligada a ele — procure por ela.`);
      }
      const arq = await downloadFile(sessao.token, String(a.file_id));
      if (!arq.stream) throw new Error("Arquivo vazio no Drive.");
      const bytes = new Uint8Array(await new Response(arq.stream).arrayBuffer());
      const ext = arq.name.toLowerCase().split(".").pop() ?? "";
      const porExt: Record<string, string> = {
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        txt: "text/plain",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };
      const mime = arq.mimeType && arq.mimeType !== "application/octet-stream" ? arq.mimeType : porExt[ext] ?? arq.mimeType;
      const partes = await bytesToParts(bytes, mime, `ARQUIVO DO DRIVE: ${arq.name}`);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const pergunta = a.pergunta ? String(a.pergunta) : "Resuma os pontos principais em tópicos curtos (fatos, valores, prazos, obrigações, combinados).";
      const r = await ai.models.generateContent({
        model: MODELOS.leitura,
        contents: [
          {
            role: "user",
            parts: [...partes, { text: `Pergunta sobre o arquivo "${arq.name}": ${pergunta}\nResponda em português, só com o que está no arquivo; se não estiver lá, diga isso.` }],
          },
        ],
      });
      return { arquivo: arq.name, resposta: r.text ?? "(sem resposta)" };
    },
  },
  {
    name: "trazer_do_drive",
    kind: "write",
    label: "Trouxe arquivo do Drive",
    description: "Registra um arquivo do Drive nos documentos do cliente no portal (continua no Drive).",
    parameters: obj(
      {
        file_id: { type: "string" },
        client_id: { type: "string" },
        titulo: { type: "string" },
        categoria: { type: "string", enum: ["contrato", "processo", "financeiro", "pessoal", "outros", "ata"] },
      },
      ["file_id", "client_id"]
    ),
    run: async (a, ctx) => {
      const c = await porId<{ id: string; name: string }>("clients", a.client_id, "Cliente");
      const fileId = String(a.file_id);
      if (ctx.role !== "admin") {
        const sessao = await getDriveSession();
        if (!sessao || !(await arquivoDoDrivePermitido(ctx, sessao.token, fileId))) throw new Error("Esse arquivo não é de um cliente seu.");
      }
      const ja = await db().from("documents").select("id, title").eq("client_id", c.id).eq("drive_file_id", fileId).maybeSingle();
      if (ja.data) return { ja_estava_no_portal: true, documento: ja.data.title, document_id: ja.data.id };
      let titulo = a.titulo ? String(a.titulo) : "";
      if (!titulo) {
        const sessao = await getDriveSession();
        titulo = (sessao ? (await getDriveFileMeta(sessao.token, fileId))?.name : null) ?? "Arquivo do Drive";
      }
      const { data, error } = await db()
        .from("documents")
        .insert({
          client_id: c.id,
          uploaded_by: ctx.profileId,
          category: (a.categoria ? String(a.categoria) : "outros") as never,
          title: titulo.replace(/\.[^.]+$/, ""),
          file_path: `drive/${fileId}`,
          drive_file_id: fileId,
        })
        .select("id, title")
        .single();
      if (error) throw error;
      return { trazido: data.title, cliente: c.name, document_id: data.id, link_no_portal: `/admin/clients/${c.id}?aba=arquivos` };
    },
  },

  // ───────── anexos enviados pelo chat (📎) ─────────
  {
    name: "ler_anexo",
    kind: "read",
    label: "Leu o anexo",
    description: "Lê um arquivo/foto que a pessoa anexou na conversa (o 'anexo' vem na mensagem como anexo=...) e responde à pergunta ou resume.",
    parameters: obj({ anexo: { type: "string" }, pergunta: { type: "string" } }, ["anexo"]),
    run: async (a, ctx) => {
      const caminho = validarAnexo(String(a.anexo), ctx);
      const { data, error } = await db().storage.from("documents").download(caminho);
      if (error || !data) throw new Error("Anexo não encontrado (pode ter expirado: anexos ficam 7 dias).");
      const nome = caminho.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
      const partes = await bytesToParts(new Uint8Array(await data.arrayBuffer()), mimePorNome(nome, data.type), `ANEXO: ${nome}`);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const pergunta = a.pergunta ? String(a.pergunta) : "Resuma os pontos principais em tópicos curtos (fatos, valores, prazos, obrigações, partes).";
      const r = await ai.models.generateContent({
        model: MODELOS.leitura,
        contents: [{ role: "user", parts: [...partes, { text: `Pergunta sobre o anexo "${nome}": ${pergunta}\nResponda em português, só com o que está no arquivo; se não estiver lá, diga isso.` }] }],
      });
      return { anexo: nome, resposta: r.text ?? "(sem resposta)" };
    },
  },
  {
    name: "salvar_anexo",
    kind: "write",
    label: "Salvou o anexo no cliente",
    description: "Guarda um anexo da conversa nos documentos de um cliente (categoria 'ata' guarda como ATA interna). Só quando a pessoa pedir.",
    parameters: obj(
      {
        anexo: { type: "string" },
        client_id: { type: "string" },
        titulo: { type: "string" },
        categoria: { type: "string", enum: ["contrato", "processo", "financeiro", "pessoal", "outros", "ata"] },
      },
      ["anexo", "client_id"]
    ),
    run: async (a, ctx) => {
      const origem = validarAnexo(String(a.anexo), ctx);
      const c = await porId<{ id: string; name: string }>("clients", a.client_id, "Cliente");
      const nome = origem.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
      const categoria = a.categoria ? String(a.categoria) : "outros";
      const destino = categoria === "ata" ? `internal/${c.id}/atas/${Date.now()}-${nome}` : `${c.id}/${Date.now()}-${nome}`;
      const { error: mvErr } = await db().storage.from("documents").move(origem, destino);
      if (mvErr) throw new Error("Não foi possível guardar o anexo (pode ter expirado).");
      const { data, error } = await db()
        .from("documents")
        .insert({
          client_id: c.id,
          uploaded_by: ctx.profileId,
          category: categoria as never,
          title: (a.titulo ? String(a.titulo) : nome.replace(/\.[^.]+$/, "")).slice(0, 200),
          file_path: destino,
        })
        .select("id, title")
        .single();
      if (error) throw error;
      return { salvo: data.title, cliente: c.name, link_no_portal: `/admin/clients/${c.id}?aba=${categoria === "ata" ? "atas" : "documentos"}` };
    },
  },

  // ───────── exclusão (sempre com confirmação na tela) ─────────
  {
    name: "excluir_atividade",
    perm: ["excluir"],
    kind: "delete",
    label: "Excluiu atividade",
    description: "Exclui uma atividade. O portal pede confirmação.",
    parameters: obj({ activity_id: { type: "string" } }, ["activity_id"]),
    resumo: () => "Excluir esta atividade",
    run: async (a) => {
      const antes = await porId<{ title: string }>("activities", a.activity_id, "Atividade");
      const { error } = await db().from("activities").delete().eq("id", String(a.activity_id));
      if (error) throw error;
      return { excluida: antes.title };
    },
  },
  {
    name: "excluir_documento",
    perm: ["excluir"],
    kind: "delete",
    label: "Excluiu documento",
    description: "Exclui documento do portal (vai para a Lixeira; Drive intocado). O portal pede confirmação.",
    parameters: obj({ document_id: { type: "string" } }, ["document_id"]),
    resumo: () => "Excluir este documento (vai para a Lixeira)",
    run: async (a) => {
      const antes = await porId<{ title: string }>("documents", a.document_id, "Documento");
      const { error } = await db().from("documents").delete().eq("id", String(a.document_id));
      if (error) throw error;
      return { excluido: antes.title, na_lixeira: true };
    },
  },
  {
    name: "excluir_cliente",
    perm: ["excluir"],
    kind: "delete",
    label: "Excluiu cliente",
    description: "Exclui o cliente e TUDO dele. O portal pede confirmação.",
    parameters: obj({ client_id: { type: "string" } }, ["client_id"]),
    resumo: () => "Excluir este cliente e tudo dele (atividades, documentos, ATAs, onboardings, demandas)",
    run: async (a) => {
      const antes = await porId<{ name: string }>("clients", a.client_id, "Cliente");
      const { error } = await db().from("clients").delete().eq("id", String(a.client_id));
      if (error) throw error;
      return { excluido: antes.name };
    },
  },

  // ───────── WhatsApp do escritório (só admin; envios com confirmação) ─────────
  ...TOOLS_WHATSAPP,
  ...TOOLS_TRANSCRICAO,
  ...TOOLS_ATAS,
  ...TOOLS_INDICADORES,
  ...TOOLS_ROTINAS,
  ...TOOLS_PROCESSOS_BUSCA,
  ...TOOLS_PAINEL,
  ...toolsOperacao(db),
  ...toolsCobranca(db),
  ...toolsSistema(db),
  ...toolsRedesenho(db),
  ...toolsMarcas(db),
];

/** hora, categoria, envolvidos e etiquetas (criar/atualizar atividade). */
async function camposExtras(a: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (a.hora !== undefined) {
    const h = String(a.hora ?? "").trim();
    if (h && !/^\d{2}:\d{2}$/.test(h)) throw new Error("Horário inválido (use HH:MM).");
    out.hora = h || null;
  }
  if (a.categoria && ["tarefa", "prazo", "audiencia"].includes(String(a.categoria))) out.categoria = String(a.categoria);
  if (a.envolvidos !== undefined) out.envolvidos = await envolvidosPorNome(a.envolvidos);
  if (a.etiquetas !== undefined) out.etiquetas = await etiquetasPorNome(a.etiquetas, true);
  return out;
}

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

/** A pessoa pode usar a ferramenta? (admin: todas; advogado: conforme as permissões) */
export function podeUsar(t: ToolDef, ctx: Ctx): boolean {
  if (t.soSuper && !ctx.superAdmin) return false;
  if (ctx.role === "admin") return true;
  // ferramentas "só admin" são as do WhatsApp do escritório
  return (!t.soAdmin || ctx.permissoes.whatsapp) && (t.perm ?? []).every((c) => ctx.permissoes[c]);
}

/** Executa a ferramenta, corta respostas enormes e registra escritas no log de auditoria. */
export async function executar(t: ToolDef, args: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown>> {
  if (!podeUsar(t, ctx)) return { ok: false, erro: "Você não tem permissão para isso." };
  try {
    const banco = ctx.role === "admin" ? createAdminClient() : await createClient();
    const valor = await bancoDaVez.run(banco, () => t.run(args, ctx));
    if (t.kind !== "read") await auditar(ctx, t.name, args, true);
    const texto = JSON.stringify(valor) ?? "null";
    if (texto.length > MAX_CHARS) return { ok: true, resultado_cortado: texto.slice(0, MAX_CHARS) + "… (cortado; use filtros)" };
    return { ok: true, resultado: valor };
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    if (t.kind !== "read") await auditar(ctx, t.name, args, false, msg);
    return { ok: false, erro: msg };
  }
}

async function auditar(ctx: Ctx, tool: string, args: unknown, ok: boolean, error?: string) {
  await mcpDb()
    .from("mcp_audit_log")
    .insert({ profile_id: ctx.profileId, tool: `chat:${tool}`, args, before_snapshot: null, ok, error: error ?? null })
    .then(
      () => undefined,
      () => undefined
    );
}

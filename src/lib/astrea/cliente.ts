import "server-only";

// Leitura do Astrea pela API interna que o próprio site do Astrea usa (login
// com usuário e senha do escritório). SÓ LEITURA: nada é tratado, descartado
// ou alterado lá. Serve para a transição (copiar tudo e acompanhar andamentos
// até o escritório cancelar o Astrea).

const BASE = "https://app.astrea.net.br";
const CABECALHO = {
  "Content-Type": "application/json;charset=UTF-8",
  Accept: "application/json",
  Referer: "https://astrea.net.br/",
  Origin: "https://astrea.net.br",
};

export type SessaoAstrea = { token: string; userId: string };

export type CasoAstrea = {
  id: string;
  number: string | null;
  title: string | null;
  customer: string | null;
  court: string | null;
  lawsuitType: string | null;
  amount: number | null;
  distribuitionDate: string | null;
  currentInstanceNumber: number | null;
  lastMovement: string | null;
  active: boolean;
};

export type PessoaAstrea = { contactId?: number; contactName: string; stakeholderRoleName: string; roleType: number };
export type PastaAstrea = {
  id: number;
  lawsuitNumber: string | null;
  title: string | null;
  courtName: string | null;
  lawsuitTypeName: string | null;
  amount: number | null;
  openDate: number | null;
  currentInstanceNumber: number | null;
  customer: PessoaAstrea | null;
  stakeholders: PessoaAstrea[];
  responsible: { name: string } | null;
  active: boolean;
};

export type HistoricoAstrea = {
  id: number;
  date: string;
  type: string; // AUTOMATIC_LAWSUIT | CLIPPING | DONE_TASK | MANUALLY | APPOINTMENT
  description: string;
  important: boolean;
  responsibleName?: string;
  tagDtos?: { label: string; color?: string }[];
};

/** Publicação da tela "Publicações" do Astrea. */
export type PublicacaoAstrea = {
  id: number;
  astreaId: number | null;
  caseId: number | null;
  caseTitle: string | null;
  caseResponsibleName: string | null;
  clippingDate: string | null; // publicado em
  releaseDate: string; // divulgado em
  clippingLawsuitNumber: string | null;
  lawsuitNumber: string | null;
  clippingMatter: string | null; // texto em HTML
  clippingSearchName: string | null;
  courtGazzete: string | null; // diário, ex.: TRF1DJN
  courtFormatted: string | null;
  division: string | null;
  status: "RECEIVED" | "ASSIGNED" | "REJECTED";
  classificationTypes?: string[];
};

export type StatusPublicacaoAstrea = PublicacaoAstrea["status"];

async function chamar<T>(caminho: string, s: SessaoAstrea | null, corpo?: unknown): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(BASE + caminho, {
      method: corpo === undefined ? "GET" : "POST",
      headers: { ...CABECALHO, ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
    if (r.ok) return (await r.json()) as T;
    if ((r.status === 429 || r.status >= 500) && tentativa < 2) {
      await new Promise((ok) => setTimeout(ok, 1500 * (tentativa + 1)));
      continue;
    }
    throw new Error(`Astrea respondeu ${r.status} em ${caminho.split("?")[0]}`);
  }
}

export async function entrarNoAstrea(): Promise<SessaoAstrea> {
  const username = process.env.ASTREA_LOGIN;
  const password = process.env.ASTREA_SENHA;
  if (!username || !password) throw new Error("Login do Astrea não configurado (ASTREA_LOGIN / ASTREA_SENHA).");
  const j = await chamar<{ status: string; id: string; session: string }>("/api/v2/session/login", null, { username, password });
  if (!j.session) throw new Error(`Login do Astrea recusado (${j.status}).`);
  return { token: j.session, userId: String(j.id) };
}

const consulta = (userId: string, limite: number, cursor: string, status: "Active" | "Archived") => ({
  userId: Number(userId),
  limit: limite,
  queryCursor: cursor,
  queryDTO: {
    contacts: [], lawsuitTypes: [], titles: [], folders: [], courts: [], stakeholderRoles: [], divisionNames: [], numbers: [],
    userId: Number(userId), order: "-lastMovement", types: [], instances: [], status, tagIds: [], treeView: false,
    onlyImportant: null, notUpdated: null, isFromContactScreen: false, treeMode: false, historiesMovement: null,
    createddate: null, shareddate: null, endeddate: null, users: [], team: null,
  },
  currentOrder: "-lastMovement",
});

/** Processos do Astrea, do movimentado mais recentemente para o mais antigo. `ate`: para de paginar quando passar dessa data (AAAA-MM-DD). */
export async function listarCasos(s: SessaoAstrea, op: { ate?: string; status?: "Active" | "Archived" } = {}): Promise<CasoAstrea[]> {
  const out: CasoAstrea[] = [];
  let cursor = "";
  for (let pagina = 0; pagina < 40; pagina++) {
    const j = await chamar<{ cases: CasoAstrea[]; cursor: string | null }>("/api/v2/case/query", s, consulta(s.userId, 50, cursor, op.status ?? "Active"));
    for (const c of j.cases ?? []) {
      if (op.ate && c.lastMovement && c.lastMovement < op.ate) return out;
      out.push(c);
    }
    if (!j.cursor || !j.cases?.length) break;
    cursor = j.cursor;
  }
  return out;
}

export const pastaDoCaso = (s: SessaoAstrea, id: string) => chamar<PastaAstrea>(`/api/v2/folder/${id}?userId=${s.userId}&withDetails=true`, s);

/** Histórico do processo (mais novo primeiro). `conhecidos`: para ao encontrar um registro já gravado. */
export async function historicoDoCaso(s: SessaoAstrea, id: string, op: { conhecidos?: Set<string>; maxPaginas?: number } = {}): Promise<HistoricoAstrea[]> {
  const out: HistoricoAstrea[] = [];
  let cursor = "";
  for (let p = 0; p < (op.maxPaginas ?? 30); p++) {
    const j = await chamar<{ historicals: HistoricoAstrea[]; cursor?: string }>(
      `/api/v2/historical/${id}/resume?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      s
    );
    let achouConhecido = false;
    for (const h of j.historicals ?? []) {
      if (op.conhecidos?.has(String(h.id))) achouConhecido = true;
      else out.push(h);
    }
    if (achouConhecido || !j.cursor || !(j.historicals ?? []).length) break;
    cursor = j.cursor;
  }
  return out;
}

/** Publicações do Astrea numa situação (RECEIVED = não tratada, ASSIGNED = tratada, REJECTED = descartada), mais nova primeiro. */
export async function listarPublicacoes(s: SessaoAstrea, status: StatusPublicacaoAstrea, op: { maxPaginas?: number } = {}): Promise<PublicacaoAstrea[]> {
  const out: PublicacaoAstrea[] = [];
  const limite = 30;
  for (let page = 0; page < (op.maxPaginas ?? 100); page++) {
    const j = await chamar<{ clippings: PublicacaoAstrea[] }>("/api/v2/clipping-service/query", s, {
      order: "-releaseDate", cursor: "", page, limit: limite, caseId: null, caseTitle: null, fromDate: null, toDate: null,
      endCreateDate: null, customerId: null, dateFilter: null, clippingTypeFilter: null, subpoenaStatusFilter: null,
      caseStatusFilter: null, status, clippingSearchName: null, state: null, userId: s.userId, caseResponsibleId: null,
      dateToShow: "CLIPPING_DATE",
    });
    out.push(...(j.clippings ?? []));
    if ((j.clippings ?? []).length < limite) break;
  }
  return out;
}

export type AlertaAstrea = { id: string; objectId?: string; type: string; arriveDate: string; contents: string; subDescriptions?: { text: string }[] };

/** Alertas pendentes do Astrea (ex.: NEW_HISTORY = "Andamento recebido" ainda não tratado). */
export async function listarAlertas(s: SessaoAstrea, maxPaginas = 10): Promise<AlertaAstrea[]> {
  const out: AlertaAstrea[] = [];
  let cursor: string | null = null;
  for (let p = 0; p < maxPaginas; p++) {
    const j: { alerts: AlertaAstrea[]; cursor: string | null } = await chamar("/api/v2/alerts/query", s, { userId: s.userId, limit: 50, cursor });
    out.push(...(j.alerts ?? []));
    if (!j.cursor || !(j.alerts ?? []).length) break;
    cursor = j.cursor;
  }
  return out;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularMetricas, tudo } from "./metricas";
import { carregarBase } from "./dados";
import { notasDeRotina } from "@/lib/rotina-relatorio/dados";
import { aberta, arred, atrasada, DIA, dentro, dias, hojeBahia, media, notaPessoa, periodoDe, dataBahia, type Periodo } from "./base";

// Indicadores individuais (28/10/2026): o mesmo retrato do Painel do Dono, mas só
// da própria pessoa. Tudo é calculado aqui, no servidor, e só a fatia da pessoa
// sai daqui — nada de outra pessoa chega à tela (quem escolhe de quem é o
// indicador é a página, e só o admin máximo pode escolher outra).

const db = () => createAdminClient() as unknown as SupabaseClient;

const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

export type Indicadores = {
  pessoa: { id: string; nome: string };
  periodo: Periodo;
  nota: number | null;
  atividades: {
    designadas: number;
    designadasAnt: number;
    entregues: number;
    entreguesAnt: number;
    abertas: number;
    atrasadas: number;
    noPrazoPct: number | null;
    tempoMedianoDias: number | null;
    tempoMedioDias: number | null;
    carga: number;
    serie: { dia: string; criadas: number; concluidas: number }[];
    entreguesLista: { id: string; titulo: string; cliente: string | null; dias: number }[];
    atrasadasLista: { id: string; titulo: string; cliente: string | null; prazo: string; diasAtraso: number }[];
    maisAntigas: { id: string; titulo: string; cliente: string | null; dias: number }[];
  };
  whatsapp: { respostas: number; respondidas: number; medianaHoras: number | null };
  trabalho: { horas: number; comentarios: number; atas: number; transcricoes: number; acoes: number };
  rotina: { media: number | null; relatorios: number };
  processos: {
    sob: number;
    andamentosNovos: number;
    andamentosNoPeriodo: number;
    andamentosTratados: number;
    publicacoesTratadas: number;
    publicacoesPendentes: number;
    tempoTratarPublicacaoHoras: number | null;
  };
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(dr|dra|doutor|doutora)\b\.?/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Processos ativos que são da pessoa: responsável do portal, ou o nome do "Responsável" do Astrea bate com o dela. */
async function meusProcessos(profileId: string, nome: string): Promise<string[]> {
  const procs = await tudo<{ id: string; responsible_id: string | null; responsavel_nome: string | null; status: string }>((a, b) =>
    db().from("processes").select("id, responsible_id, responsavel_nome, status").eq("status", "ativo").range(a, b)
  );
  const alvo = norm(nome);
  return procs
    .filter((x) => {
      if (x.responsible_id === profileId) return true;
      const r = x.responsavel_nome ? norm(x.responsavel_nome).split(" ") : [];
      const a = alvo.split(" ");
      // mesmo primeiro nome; o resto do nome do Astrea pode ser só a inicial ("MAURICIO O.") ou o começo do sobrenome ("Dra. Franciele")
      return r.length > 0 && r[0].length >= 4 && r[0] === a[0] && r.slice(1).every((t) => t.length <= 1 || a.slice(1).some((u) => u.startsWith(t)));
    })
    .map((x) => x.id);
}

async function contarEm(ids: string[], montar: (lote: string[]) => PromiseLike<{ count: number | null }>): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += 150) total += (await montar(ids.slice(i, i + 150))).count ?? 0;
  return total;
}

async function andamentosEPublicacoes(profileId: string, nome: string, p: Periodo) {
  const ids = await meusProcessos(profileId, nome);
  const [tratados, pubsMinhas, novos, noPeriodo, pendentes] = await Promise.all([
    db().from("andamentos").select("id", { count: "exact", head: true }).eq("tratado_por", profileId).gte("tratado_em", p.ini).lt("tratado_em", p.fim),
    tudo<{ created_at: string; tratada_em: string }>((a, b) =>
      db().from("publicacoes").select("created_at, tratada_em").eq("tratada_por", profileId).gte("tratada_em", p.ini).lt("tratada_em", p.fim).range(a, b)
    ),
    contarEm(ids, (lote) => db().from("andamentos").select("id", { count: "exact", head: true }).eq("situacao", "novo").in("process_id", lote)),
    contarEm(ids, (lote) => db().from("andamentos").select("id", { count: "exact", head: true }).gte("created_at", p.ini).lt("created_at", p.fim).in("process_id", lote)),
    contarEm(ids, (lote) => db().from("publicacoes").select("id", { count: "exact", head: true }).eq("status", "nao_tratada").in("process_id", lote)),
  ]);
  return {
    sob: ids.length,
    andamentosNovos: novos,
    andamentosNoPeriodo: noPeriodo,
    andamentosTratados: tratados.count ?? 0,
    publicacoesTratadas: pubsMinhas.length,
    publicacoesPendentes: pendentes,
    tempoTratarPublicacaoHoras: arred(mediana(pubsMinhas.map((x) => (Date.parse(x.tratada_em) - Date.parse(x.created_at)) / 3_600_000)), 1),
  };
}

/** Indicadores de UMA pessoa (perfil) no período. `null` se a pessoa não existe. */
export async function indicadoresDe(profileId: string, periodoId: string): Promise<Indicadores | null> {
  const p = periodoDe(periodoId);
  const { data: perfil } = await db().from("profiles").select("id, full_name").eq("id", profileId).maybeSingle();
  if (!perfil) return null;
  const nome = String(perfil.full_name);
  const [m, base] = await Promise.all([calcularMetricas(p), carregarBase()]);
  const eq = m.equipe.find((x) => x.id === profileId);
  const resp = base.responsaveis.find((r) => r.profileId === profileId);
  const minhas = resp ? base.atividades.filter((a) => a.respId === resp.id) : [];
  const nomeCli = new Map(base.clientes.map((c) => [c.id, c.nome]));
  const h = hojeBahia();

  const designadas = minhas.filter((a) => dentro(a.criada, p.ini, p.fim));
  const entregues = minhas.filter((a) => a.status === "concluida" && dentro(a.concluida, p.ini, p.fim));
  const abertas = minhas.filter(aberta);
  const atrasadas = abertas.filter((a) => atrasada(a, h));
  const tempos = entregues.map((a) => dias(a.pedido, a.concluida!));
  const nota = notaPessoa(minhas, p.ini, p.fim, h);

  // série por dia (ou por mês em períodos longos)
  const porMes = Math.ceil(dias(p.ini, p.fim)) > 62;
  const chave = (iso: string) => (porMes ? dataBahia(iso).slice(0, 7) : dataBahia(iso));
  const mapa = new Map<string, { criadas: number; concluidas: number }>();
  for (let t = Date.parse(p.ini); t < Date.parse(p.fim); t += DIA) mapa.set(chave(new Date(t).toISOString()), { criadas: 0, concluidas: 0 });
  for (const a of designadas) {
    const v = mapa.get(chave(a.criada));
    if (v) v.criadas++;
  }
  for (const a of entregues) {
    const v = mapa.get(chave(a.concluida!));
    if (v) v.concluidas++;
  }

  const extras = await andamentosEPublicacoes(profileId, nome, p);
  const notaRot = resp ? (await notasDeRotina(dataBahia(p.ini), dataBahia(p.fim))).get(resp.id) : undefined;
  const zap = m.atendimento.tempoPorPessoa.find((x) => x.id === profileId);
  const respostas = m.atendimento.respostasPorPessoa.find((x) => x.id === profileId);

  return {
    pessoa: { id: profileId, nome },
    periodo: p,
    nota: nota.nota,
    atividades: {
      designadas: designadas.length,
      designadasAnt: minhas.filter((a) => dentro(a.criada, p.iniAnterior, p.fimAnterior)).length,
      entregues: entregues.length,
      entreguesAnt: minhas.filter((a) => a.status === "concluida" && dentro(a.concluida, p.iniAnterior, p.fimAnterior)).length,
      abertas: abertas.length,
      atrasadas: atrasadas.length,
      noPrazoPct: nota.noPrazoPct,
      tempoMedianoDias: arred(mediana(tempos), 1),
      tempoMedioDias: arred(media(tempos), 1),
      carga: nota.carga,
      serie: [...mapa.entries()].map(([dia, v]) => ({ dia, ...v })),
      entreguesLista: [...entregues]
        .sort((x, y) => y.concluida!.localeCompare(x.concluida!))
        .slice(0, 10)
        .map((a) => ({ id: a.id, titulo: a.titulo, cliente: a.clienteId ? nomeCli.get(a.clienteId) ?? null : null, dias: Math.round(dias(a.pedido, a.concluida!) * 10) / 10 })),
      atrasadasLista: atrasadas
        .sort((a, b) => a.prazo!.localeCompare(b.prazo!))
        .slice(0, 10)
        .map((a) => ({ id: a.id, titulo: a.titulo, cliente: a.clienteId ? nomeCli.get(a.clienteId) ?? null : null, prazo: a.prazo!, diasAtraso: Math.max(1, Math.round((Date.parse(`${h}T12:00:00Z`) - Date.parse(`${a.prazo}T12:00:00Z`)) / DIA)) })),
      maisAntigas: [...abertas]
        .sort((a, b) => a.criada.localeCompare(b.criada))
        .slice(0, 8)
        .map((a) => ({ id: a.id, titulo: a.titulo, cliente: a.clienteId ? nomeCli.get(a.clienteId) ?? null : null, dias: Math.floor(dias(a.criada, new Date().toISOString())) })),
    },
    whatsapp: { respostas: respostas?.n ?? eq?.mensagens ?? 0, respondidas: zap?.respondidas ?? 0, medianaHoras: zap?.medianaHoras ?? null },
    trabalho: { horas: eq?.horas ?? 0, comentarios: eq?.comentarios ?? 0, atas: eq?.atas ?? 0, transcricoes: eq?.transcricoes ?? 0, acoes: eq?.acoes ?? 0 },
    rotina: { media: notaRot?.media ?? null, relatorios: notaRot?.relatorios ?? 0 },
    processos: extras,
  };
}

/** Mini visão da Visão geral: leve (sem varrer o WhatsApp), só do próprio usuário. */
export async function miniIndicadores(profileId: string, nome: string) {
  const h = hojeBahia();
  const mes = periodoDe("mes");
  const { data: resp } = await db().from("responsaveis").select("id").eq("profile_id", profileId).maybeSingle();
  const atividades = resp
    ? await tudo<{ status: string; deadline: string | null; concluida_em: string | null; created_at: string }>((a, b) =>
        db().from("activities").select("status, deadline, concluida_em, created_at").eq("responsavel_id", resp.id).is("archived_at", null).range(a, b)
      )
    : [];
  const abertas = atividades.filter((x) => x.status === "aberta" || x.status === "em_andamento");
  const entregues = atividades.filter((x) => x.status === "concluida" && dentro(x.concluida_em, mes.ini, mes.fim));
  const extras = await andamentosEPublicacoes(profileId, nome, mes);
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((x) => x.deadline && x.deadline < h).length,
    entregues: entregues.length,
    noPrazoPct: entregues.length ? Math.round((entregues.filter((x) => !x.deadline || (x.concluida_em ?? "").slice(0, 10) <= x.deadline).length / entregues.length) * 100) : null,
    publicacoesPendentes: extras.publicacoesPendentes,
    andamentosNovos: extras.andamentosNovos,
  };
}

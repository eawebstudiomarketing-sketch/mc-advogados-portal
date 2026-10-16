import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// O dia de uma pessoa: compromissos em que ela participa, atividades dela que
// vencem no dia e as atrasadas. Usado na tela "Meu dia" (Agenda) e na
// mensagem das 7h pelo WhatsApp. Lê com a chave de serviço: quem chama decide
// quem pode ver o dia de quem.

export type CompromissoDoDia = { id: string; titulo: string; tipo: string; hora: string; fim: string | null; local: string | null; cliente: string | null };
export type AtividadeDoDia = { id: string; titulo: string; categoria: string; hora: string | null; prazo: string | null; cliente: string | null; status: string };

export type DiaDaPessoa = {
  compromissos: CompromissoDoDia[];
  deHoje: AtividadeDoDia[];
  atrasadas: AtividadeDoDia[];
  proximas: AtividadeDoDia[]; // próximos 3 dias, para não pegar ninguém de surpresa
};

const horaBahia = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function diaDaPessoa(responsavelId: string, dia: string): Promise<DiaDaPessoa> {
  const db = createAdminClient();
  const inicio = new Date(`${dia}T00:00:00-03:00`).toISOString();
  const fim = new Date(`${somaDias(dia, 1)}T00:00:00-03:00`).toISOString();

  const [{ data: comps }, { data: ativs }] = await Promise.all([
    db
      .from("compromissos")
      .select("id, titulo, tipo, inicio, fim, local, clients(name)")
      .contains("participantes", [responsavelId])
      .gte("inicio", inicio)
      .lt("inicio", fim)
      .order("inicio"),
    db
      .from("activities")
      .select("id, title, categoria, hora, deadline, status, clients(name)")
      .eq("responsavel_id", responsavelId)
      .in("status", ["aberta", "em_andamento"])
      .is("archived_at", null)
      .not("deadline", "is", null)
      .lte("deadline", somaDias(dia, 3))
      .order("deadline")
      .order("hora", { nullsFirst: true }),
  ]);

  const nome = (c: unknown) => (c as { name: string } | null)?.name ?? null;
  const atividade = (a: NonNullable<typeof ativs>[number]): AtividadeDoDia => ({
    id: a.id,
    titulo: a.title,
    categoria: a.categoria,
    hora: a.hora,
    prazo: a.deadline,
    cliente: nome(a.clients),
    status: a.status,
  });
  const lista = ativs ?? [];
  return {
    compromissos: (comps ?? []).map((c) => ({
      id: c.id,
      titulo: c.titulo,
      tipo: c.tipo,
      hora: horaBahia(c.inicio),
      fim: c.fim ? horaBahia(c.fim) : null,
      local: c.local,
      cliente: nome(c.clients),
    })),
    deHoje: lista.filter((a) => a.deadline === dia).map(atividade),
    atrasadas: lista.filter((a) => a.deadline! < dia).map(atividade),
    proximas: lista.filter((a) => a.deadline! > dia).map(atividade),
  };
}

const ROTULO_CAT: Record<string, string> = { prazo: "Prazo", audiencia: "Audiência", tarefa: "Tarefa" };
const ROTULO_TIPO: Record<string, string> = { reuniao: "Reunião", ligacao: "Ligação", evento: "Evento", outro: "Compromisso" };
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

/** Texto da mensagem das 7h (WhatsApp: *negrito*, _itálico_). */
export function textoDaRotina(nome: string, dia: string, d: DiaDaPessoa, url: string): string {
  const primeiro = nome.replace(/^(Dr\.?|Dra\.?)\s+/i, "").split(" ")[0];
  const semana = new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const linhas: string[] = [`Bom dia, ${primeiro}! ☀️`, `Sua agenda de *${semana}*:`];

  if (d.compromissos.length) {
    linhas.push("", "📅 *Compromissos*");
    for (const c of d.compromissos)
      linhas.push(`• ${c.hora}${c.fim ? `–${c.fim}` : ""} ${ROTULO_TIPO[c.tipo] ?? "Compromisso"}: ${c.titulo}${c.cliente ? ` (${c.cliente})` : ""}${c.local ? ` · ${c.local}` : ""}`);
  }
  if (d.deHoje.length) {
    linhas.push("", "⚖️ *Vence hoje*");
    for (const a of d.deHoje) linhas.push(`• ${a.hora ? `${a.hora.slice(0, 5)} ` : ""}${ROTULO_CAT[a.categoria] ?? "Tarefa"}: ${a.titulo}${a.cliente ? ` (${a.cliente})` : ""}`);
  }
  if (d.atrasadas.length) {
    linhas.push("", `⚠️ *Atrasadas (${d.atrasadas.length})*`);
    for (const a of d.atrasadas.slice(0, 6)) linhas.push(`• ${a.titulo}${a.cliente ? ` (${a.cliente})` : ""} — venceu ${dataCurta(a.prazo!)}`);
    if (d.atrasadas.length > 6) linhas.push(`• e mais ${d.atrasadas.length - 6}`);
  }
  if (d.proximas.length) {
    linhas.push("", "🗓️ *Próximos dias*");
    for (const a of d.proximas.slice(0, 5)) linhas.push(`• ${dataCurta(a.prazo!)} ${a.titulo}${a.cliente ? ` (${a.cliente})` : ""}`);
  }
  if (!d.compromissos.length && !d.deHoje.length && !d.atrasadas.length && !d.proximas.length) {
    linhas.push("", "Nada marcado para hoje. Bom trabalho! ✅");
  }
  linhas.push("", `Ver no portal: ${url}`);
  return linhas.join("\n");
}

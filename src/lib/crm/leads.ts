import "server-only";
import { criarAvisos } from "@/lib/avisos";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { MAURICIO } from "@/lib/rotina-relatorio/dia";
import { db, etapaInicial, lerConfig, lerLead, listarEtapas, proximoResponsavel, registrarEvento, statusDaEtapa } from "./dados";
import { enviarGa4, enviarMeta } from "./pixel";
import { telefoneBonito, telefoneLimpo, type Formulario, type Lead, type Resposta } from "./tipos";

// CRM / Comercial (06/11/2026): o que acontece com o lead. Chegou pelo
// formulário → entra na 1ª etapa, vai para quem está na vez e essa pessoa é
// avisada no portal e no WhatsApp; a Meta recebe o Lead pelo servidor. Mudou
// de etapa → histórico + evento para os anúncios (Reunião = Schedule, Fechado = Purchase).

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br";

export type EnvioFormulario = {
  respostas: Record<string, string | string[]>;
  sessao: string;
  eventId: string;
  utm: Record<string, string>;
  rastreio: Record<string, string>;
};

const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : String(v ?? "")).trim().slice(0, 2000);

export async function registrarPassoFormulario(formularioId: string, sessao: string, tipo: "abriu" | "comecou" | "enviou") {
  if (!/^[a-z0-9-]{8,64}$/i.test(sessao)) return;
  await db().from("crm_form_eventos").upsert({ formulario_id: formularioId, sessao, tipo }, { onConflict: "formulario_id,sessao,tipo", ignoreDuplicates: true });
}

async function telefoneDaPessoa(profileId: string): Promise<string | null> {
  const { data } = await db().from("responsaveis").select("telefone").eq("profile_id", profileId).maybeSingle();
  const t = String(data?.telefone ?? "").replace(/\D/g, "");
  return t.length >= 10 ? t : null;
}

/** Envio do formulário público. Devolve o id do lead ou o erro para mostrar. */
export async function criarLeadDoFormulario(form: Formulario, e: EnvioFormulario): Promise<{ ok: true; id: string; novo: boolean } | { ok: false; erro: string }> {
  const campos = form.config.campos;
  for (const c of campos) if (c.obrigatorio && !texto(e.respostas[c.id])) return { ok: false, erro: `Responda: ${c.titulo}` };
  const mapa = (k: "nome" | "telefone" | "email" | "empresa") => {
    const c = campos.find((x) => x.mapear === k) ?? (k === "telefone" ? campos.find((x) => x.tipo === "telefone") : k === "email" ? campos.find((x) => x.tipo === "email") : undefined);
    return c ? texto(e.respostas[c.id]) || null : null;
  };
  const nome = mapa("nome");
  const telefone = telefoneLimpo(mapa("telefone")) || null;
  const email = mapa("email");
  const empresa = mapa("empresa");
  if (!nome && !telefone && !email) return { ok: false, erro: "Deixe pelo menos seu nome e WhatsApp para a gente falar com você." };
  const respostas: Resposta[] = campos.filter((c) => texto(e.respostas[c.id])).map((c) => ({ pergunta: c.titulo, resposta: texto(e.respostas[c.id]) }));

  // trava contra robô (muitas respostas do mesmo IP em 10 min) e a mesma pessoa
  // respondendo de novo em 24 h (atualiza o lead em vez de criar outro), juntas
  const ip = e.rastreio.ip ?? "";
  const [{ count }, { data: igual }, etapa] = await Promise.all([
    ip
      ? db().from("leads").select("id", { count: "exact", head: true }).eq("rastreio->>ip", ip).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
      : Promise.resolve({ count: 0 }),
    telefone
      ? db().from("leads").select("id").eq("telefone", telefone).eq("formulario_id", form.id).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    etapaInicial(),
  ]);
  if ((count ?? 0) >= 5) return { ok: false, erro: "Recebemos várias respostas seguidas daqui. Tente de novo em alguns minutos." };
  {
    if (igual) {
      await db().from("leads").update({ respostas, nome, email, empresa, updated_at: new Date().toISOString() }).eq("id", igual.id);
      await registrarEvento(igual.id as string, "formulario", "Respondeu o formulário de novo", { formulario: form.nome });
      return { ok: true, id: igual.id as string, novo: false };
    }
  }

  const responsavel = await proximoResponsavel(form.responsavel_padrao ?? MAURICIO);
  const { data, error } = await db()
    .from("leads")
    .insert({
      nome,
      telefone,
      email,
      empresa,
      origem: e.utm.source ? String(e.utm.source).slice(0, 40) : "formulario",
      status: "novo",
      etapa_id: etapa?.id ?? null,
      formulario_id: form.id,
      responsavel,
      respostas,
      utm: e.utm,
      rastreio: { ...e.rastreio, event_id: e.eventId },
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, erro: "Não foi possível enviar agora. Tente de novo." };
  await Promise.all([registrarEvento(data.id, "criado", `Chegou pelo formulário ${form.nome}`, { formulario: form.slug, utm: e.utm }), registrarPassoFormulario(form.id, e.sessao, "enviou")]);
  return { ok: true, id: data.id as string, novo: true };
}

/** Depois do envio (fora do tempo de resposta): avisa quem cuida e manda o Lead para a Meta. */
export async function depoisDoLead(leadId: string, form: Formulario) {
  const lead = await lerLead(leadId);
  if (!lead) return;
  const cfg = await lerConfig();
  const url = `/admin/comercial/${lead.id}`;
  const quem = lead.nome ?? telefoneBonito(lead.telefone) ?? "Sem nome";
  const tarefas: Promise<unknown>[] = [];
  if (lead.responsavel) {
    tarefas.push(criarAvisos([{ profile_id: lead.responsavel, tipo: "lead_novo", titulo: `🎯 Lead novo: ${quem}`, corpo: `${form.nome}${lead.empresa ? ` · ${lead.empresa}` : ""}`, url }]));
    if (cfg.avisar_zap) {
      tarefas.push(
        telefoneDaPessoa(lead.responsavel).then((tel) =>
          tel
            ? enfileirarMensagem({
                para: tel,
                texto: [
                  `*🎯 Lead novo: ${quem}*`,
                  `Formulário: ${form.nome}`,
                  lead.telefone ? `WhatsApp: ${telefoneBonito(lead.telefone)} → https://wa.me/${lead.telefone}` : "",
                  lead.utm?.source ? `Origem: ${[lead.utm.source, lead.utm.campaign].filter(Boolean).join(" · ")}` : "",
                  "",
                  ...lead.respostas.slice(0, 10).map((r) => `• ${r.pergunta}: ${r.resposta}`),
                  "",
                  `Abrir no CRM: ${SITE}${url}`,
                ]
                  .filter((l, i, a) => l !== "" || a[i - 1] !== "")
                  .join("\n"),
                origemRef: `lead-novo:${lead.id}`,
              }).catch(() => null)
            : null,
        ),
      );
    }
  }
  tarefas.push(
    enviarMeta("Lead", lead, { eventId: lead.rastreio.event_id }).then((r) => (r.ok ? registrarEvento(lead.id, "pixel", "Lead enviado para a Meta (API de Conversões)") : null)),
  );
  await Promise.allSettled(tarefas);
}

/** Muda de etapa: histórico, datas de ganho/perda e evento para os anúncios. */
export async function moverLead(leadId: string, etapaId: string, porProfileId: string, extra: { motivo?: string | null; valor?: number | null } = {}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const [lead, etapas] = await Promise.all([lerLead(leadId), listarEtapas()]);
  if (!lead) return { ok: false, erro: "Lead não encontrado." };
  const nova = etapas.find((x) => x.id === etapaId);
  if (!nova) return { ok: false, erro: "Etapa não encontrada." };
  if (lead.etapa_id === etapaId && !extra.motivo && extra.valor === undefined) return { ok: true };
  const antiga = etapas.find((x) => x.id === lead.etapa_id);
  const agora = new Date().toISOString();
  const campos: Record<string, unknown> = { etapa_id: etapaId, status: statusDaEtapa(nova), updated_at: agora };
  if (nova.tipo === "ganho") campos.ganho_em = lead.ganho_em ?? agora;
  if (nova.tipo === "perdido") {
    campos.perdido_em = agora;
    campos.motivo_perda = extra.motivo?.trim() || lead.motivo_perda || null;
  }
  if (nova.tipo === "aberta") {
    campos.ganho_em = null;
    campos.perdido_em = null;
  }
  if (extra.valor !== undefined) campos.valor = extra.valor;
  // saiu de "Novo": conta como primeiro contato (tempo de resposta nos Números)
  if (!lead.primeiro_contato_em && antiga && antiga.ordem === Math.min(...etapas.map((x) => x.ordem)) && nova.id !== antiga.id) campos.primeiro_contato_em = agora;
  const { error } = await db().from("leads").update(campos).eq("id", leadId);
  if (error) return { ok: false, erro: "Não foi possível mudar a etapa." };
  await registrarEvento(leadId, "etapa", `${antiga?.nome ?? "—"} → ${nova.nome}${nova.tipo === "perdido" && campos.motivo_perda ? ` (motivo: ${campos.motivo_perda})` : ""}`, { de: antiga?.id, para: nova.id }, porProfileId);

  // anúncios aprendem com quem avança (só uma vez por tipo de evento)
  const atualizado = { ...lead, ...campos } as Lead;
  const valor = (campos.valor as number | null | undefined) ?? lead.valor;
  if (nova.tipo === "ganho" && !lead.ganho_em) {
    const [m] = await Promise.all([enviarMeta("Purchase", atualizado, { valor, eventId: `purchase-${lead.id}` }), enviarGa4("close_convert_lead", atualizado, valor)]);
    if (m.ok) await registrarEvento(leadId, "pixel", "Venda enviada para a Meta (Purchase)");
  } else if (/reuni/i.test(nova.nome) && !/reuni/i.test(antiga?.nome ?? "")) {
    const m = await enviarMeta("Schedule", atualizado, { eventId: `schedule-${lead.id}` });
    if (m.ok) await registrarEvento(leadId, "pixel", "Reunião enviada para a Meta (Schedule)");
  }
  return { ok: true };
}

/** Cria o cliente a partir do lead e leva o lead para "Fechado". */
export async function virarCliente(leadId: string, porProfileId: string): Promise<{ ok: true; clientId: string } | { ok: false; erro: string }> {
  const lead = await lerLead(leadId);
  if (!lead) return { ok: false, erro: "Lead não encontrado." };
  if (lead.client_id) return { ok: true, clientId: lead.client_id };
  const nome = lead.empresa || lead.nome;
  if (!nome) return { ok: false, erro: "Dê um nome ao lead antes de virar cliente." };
  const id = crypto.randomUUID();
  const { error } = await db()
    .from("clients")
    .insert({
      id,
      name: nome,
      tipo_pessoa: lead.empresa ? "PJ" : "PF",
      email_contact: lead.email,
      whatsapp_numeros: lead.telefone ? [lead.telefone] : [],
      comentarios: [`Veio do CRM (${new Date(lead.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" })})${lead.empresa && lead.nome ? ` · contato: ${lead.nome}` : ""}`, ...lead.respostas.map((r) => `${r.pergunta}: ${r.resposta}`)].join("\n"),
    });
  if (error) return { ok: false, erro: "Não foi possível criar o cliente." };
  await db().from("leads").update({ client_id: id, updated_at: new Date().toISOString() }).eq("id", leadId);
  await registrarEvento(leadId, "cliente", `Virou cliente: ${nome}`, { client_id: id }, porProfileId);
  const ganho = (await listarEtapas()).find((x) => x.tipo === "ganho");
  if (ganho && lead.etapa_id !== ganho.id) await moverLead(leadId, ganho.id, porProfileId);
  return { ok: true, clientId: id };
}

import "server-only";
import type { Part } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOnboardingText } from "@/lib/onboarding-demands";
import { stagesFromStored } from "@/lib/onboarding-stages";
import { bytesToParts, documentToParts } from "@/lib/document-content";
import { generateDemandsFromSources } from "@/lib/demands-ai";
import { defaultDeadline } from "@/lib/demand-deadline";
import { handoffParaTexto, type HandoffAnswers } from "@/lib/handoff-schema";
import type { Database } from "@/lib/supabase/types";

// Geração de demandas a partir das fontes escolhidas (ficha de handoff,
// onboardings, ATAs, documento avulso). Usada pela ficha do cliente
// (app/api/demandas/gerar) e pelo assistente do portal.

export type DemandSource = { tipo: "triagem" | "onboarding" | "ata" | "documento"; id?: string; titulo: string };
type Db = SupabaseClient<Database>;
type Cliente = { id: string; name: string };

const dataBR = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR");
const sanitizar = (nome: string) => nome.normalize("NFKD").replace(/[^\w.\-]+/g, "_");

export type ResultadoDemandas = { ok: true; geradas: number; titulos: string[] } | { ok: false; error: string; status: number };

export async function gerarDemandasDoCliente(
  db: Db,
  opts: {
    client: Cliente;
    ficha: { handoff: HandoffAnswers | null; triagem: string | null };
    profileId: string;
    usarFicha: boolean;
    onboardingIds: string[];
    ataIds: string[];
    instrucoes: string;
    /** responsável já escolhido para as demandas (vira o da atividade ao aprovar) */
    responsavelId?: string | null;
    arquivo?: { bytes: Uint8Array; mimeType: string; nome: string };
  }
): Promise<ResultadoDemandas> {
  const { client, onboardingIds, ataIds, instrucoes, arquivo } = opts;
  if (!opts.usarFicha && !onboardingIds.length && !ataIds.length && !arquivo) {
    return { ok: false, error: "Escolha pelo menos uma fonte (ficha de handoff, onboarding, ATA ou documento).", status: 400 };
  }

  const material: Part[] = [];
  const sources: DemandSource[] = [];

  try {
    if (opts.usarFicha) {
      const ficha = handoffParaTexto(opts.ficha.handoff, opts.ficha.triagem);
      if (!ficha.trim()) return { ok: false, error: "Este cliente ainda não tem a Ficha de Handoff preenchida.", status: 400 };
      material.push({ text: `\n--- FICHA DE HANDOFF (comercial → jurídico) ---\n${ficha}` });
      sources.push({ tipo: "triagem", titulo: "Ficha de handoff" });
    }

    if (onboardingIds.length) {
      const { data: obs } = await db.from("onboardings").select("id, answers, questions, created_at").eq("client_id", client.id).in("id", onboardingIds);
      for (const o of obs ?? []) {
        const titulo = `Onboarding de ${dataBR(o.created_at)}`;
        material.push({ text: `\n--- ${titulo.toUpperCase()} ---\n${buildOnboardingText(client.name, o.answers as Record<string, string>, stagesFromStored(o.questions))}` });
        sources.push({ tipo: "onboarding", id: o.id, titulo });
      }
    }

    if (ataIds.length) {
      const { data: atas } = await db
        .from("documents")
        .select("id, title, file_path, drive_file_id, meeting_date, created_at")
        .eq("client_id", client.id)
        .eq("category", "ata")
        .in("id", ataIds);
      for (const a of atas ?? []) {
        const quando = a.meeting_date ? ` (reunião de ${dataBR(a.meeting_date)})` : "";
        material.push(...(await documentToParts(a, `ATA${quando}`)));
        sources.push({ tipo: "ata", id: a.id, titulo: a.title });
      }
    }

    if (arquivo) {
      const titulo = arquivo.nome.replace(/\.[^.]+$/, "") || "Documento";
      material.push(...(await bytesToParts(arquivo.bytes, arquivo.mimeType || "application/octet-stream", `DOCUMENTO: ${titulo}`)));
      // fica salvo nos documentos do cliente (vai pro Drive na próxima sincronização)
      const filePath = `${client.id}/${Date.now()}-${sanitizar(arquivo.nome)}`;
      const { error: upErr } = await db.storage.from("documents").upload(filePath, arquivo.bytes, { contentType: arquivo.mimeType || undefined });
      if (upErr) return { ok: false, error: "Não foi possível salvar o documento enviado.", status: 500 };
      const { data: doc, error: insErr } = await db
        .from("documents")
        .insert({ client_id: client.id, uploaded_by: opts.profileId, category: "outros", title: titulo, file_path: filePath })
        .select("id")
        .single();
      if (insErr || !doc) {
        await db.storage.from("documents").remove([filePath]);
        return { ok: false, error: "Não foi possível salvar o documento enviado.", status: 500 };
      }
      sources.push({ tipo: "documento", id: doc.id, titulo });
    }
  } catch (e) {
    return { ok: false, error: `Não foi possível ler o material: ${e instanceof Error ? e.message : "erro desconhecido"}.`, status: 400 };
  }

  const { data: abertas } = await db.from("activities").select("title").eq("client_id", client.id).in("status", ["aberta", "em_andamento"]).is("archived_at", null);
  const result = await generateDemandsFromSources({ clientName: client.name, material, instructions: instrucoes, openActivities: (abertas ?? []).map((a) => a.title) });
  if (!result.ok) return { ok: false, error: result.error, status: 502 };

  // Gerar de novo substitui só os rascunhos ainda não revisados do cliente; o
  // que já foi aprovado (virou atividade) ou descartado fica como está.
  await db.from("onboarding_demand_drafts").delete().eq("client_id", client.id).eq("status", "rascunho");
  const { error } = await db.from("onboarding_demand_drafts").insert(
    result.data.map((d, index) => ({
      client_id: client.id,
      onboarding_id: onboardingIds.length === 1 && sources.length === 1 ? onboardingIds[0] : null,
      position: index,
      title: d.title.trim(),
      priority: d.priority,
      activity_type: d.activity_type,
      action: d.action.trim(),
      reason: d.reason.trim(),
      next_step: d.next_step.trim(),
      deadline: defaultDeadline(d.priority),
      sources,
      instructions: instrucoes || null,
      responsavel_id: opts.responsavelId || null,
    }))
  );
  if (error) return { ok: false, error: "As demandas foram geradas, mas não foi possível salvá-las.", status: 500 };
  return { ok: true, geradas: result.data.length, titulos: result.data.map((d) => d.title) };
}

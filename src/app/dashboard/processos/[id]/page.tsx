import Link from "next/link";
import { notFound } from "next/navigation";
import { Gavel, MessageSquarePlus } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";
import { BackButton } from "@/components/nav/back-button";
import { EmptyState } from "@/components/ui/empty-state";

const dataBR = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");

// Processo no portal do CLIENTE (12/11/2026): capa simples + linha do tempo dos
// andamentos (sem tarefas internas nem descartados) + "Falar com o escritório".
// O cliente não lê a tabela de andamentos direto (RLS só da equipe): o servidor
// confere que o processo é do cliente e busca com a chave de serviço.
export default async function ProcessoDoClientePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["client"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !profile.client_id) notFound();

  const supabase = await createClient();
  const { data: p } = await supabase
    .from("processes")
    .select("id, client_id, numero_processo, area, vara_tribunal, fase, status, updated_at")
    .eq("id", id)
    .eq("client_id", profile.client_id)
    .maybeSingle();
  if (!p) notFound();

  const { data: ands } = await createAdminClient()
    .from("andamentos")
    .select("id, data, descricao, importante, tipo, situacao")
    .eq("process_id", p.id)
    .neq("tipo", "tarefa")
    .neq("situacao", "descartado")
    .order("data", { ascending: false })
    .limit(60);
  const andamentos = (ands ?? []).map((a) => ({ ...a, texto: String(a.descricao ?? "").replace(/^\s*N[°º]\s*\d+\s*/i, "").replace(/\s+/g, " ").trim() }));

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton fallback="/dashboard/processos" />
      <div className="mt-5 mb-6">
        <p className="eyebrow">Processo</p>
        <h1 className="mt-2 break-all font-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl">{p.numero_processo}</h1>
        <p className="mt-1 text-[15px] text-foreground/70">
          {PROCESS_AREA_LABEL[p.area as keyof typeof PROCESS_AREA_LABEL] ?? p.area}
          {p.vara_tribunal ? ` · ${p.vara_tribunal}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {p.fase && <span className="rounded-full bg-gold-soft px-2.5 py-1 font-medium text-gold-ink">Fase: {p.fase}</span>}
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted ring-1 ring-border">Atualizado em {dataBR(p.updated_at)}</span>
        </div>
        <Link href={`/dashboard/pedidos/novo?processo=${encodeURIComponent(p.numero_processo ?? "")}`} className="ui-btn mt-5 inline-flex">
          <MessageSquarePlus className="h-4 w-4" aria-hidden /> Falar com o escritório sobre este processo
        </Link>
      </div>

      <section className="ui-card p-5">
        <h2 className="section-title">O que aconteceu no processo</h2>
        {andamentos.length === 0 ? (
          <EmptyState icon={Gavel} title="Nenhuma movimentação registrada ainda" compact />
        ) : (
          <ol className="mt-4 space-y-0">
            {andamentos.map((a, i) => (
              <li key={a.id} className="relative flex gap-4 pb-5 last:pb-0">
                {i < andamentos.length - 1 && <span className="absolute top-3 left-[5px] h-full w-px bg-border" aria-hidden />}
                <span className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ${a.importante ? "bg-gold" : "bg-navy-3"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted">{dataBR(a.data)}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-foreground">{a.texto.length > 400 ? `${a.texto.slice(0, 400)}…` : a.texto || "Movimentação"}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-xs text-muted">Dúvida sobre alguma movimentação? Use o botão acima: o pedido já vai com o número do processo.</p>
      </section>
    </div>
  );
}

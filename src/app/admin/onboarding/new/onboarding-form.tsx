"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { saveOnboardingAction, type SaveOnboardingState } from "../actions";
import {
  ONBOARDING_STAGES,
  type OnboardingStage,
  ONBOARDING_OBJECTIVE,
  ONBOARDING_INFO_ESSENCIAIS,
  ONBOARDING_CHECKLIST_CONCLUSAO,
  ONBOARDING_REGRA_OURO,
  MC_LETTERHEAD,
  MC_FOOTER_VALORES,
} from "@/lib/onboarding-schema";
import type { Client } from "@/lib/data/clients";
import { toStored } from "@/lib/onboarding-stages";
import { AudioAnswer } from "@/components/ui/audio-answer";
import { VoltarInput } from "@/components/nav/back-button";

// Visual do modelo "Onboarding MC Adv.html" (out/2026): capa navy com timbre,
// barra fixa de etapas com progresso e um cartão por etapa (perguntas
// numeradas à esquerda, ações à direita).
const C = {
  navy: "#091827",
  navy2: "#11273b",
  navy3: "#17344d",
  gold: "#c6a24f",
  gold2: "#e1cd93",
  paper: "#f7f4ee",
  ink: "#1b2732",
  muted: "#66727d",
};

const initialState: SaveOnboardingState = { error: null };
const dois = (n: number) => String(n).padStart(2, "0");

export function OnboardingForm({
  clients,
  preselectedClientId,
  stages = ONBOARDING_STAGES,
  personalizado = false,
  onRegenerar,
}: {
  clients: Client[];
  preselectedClientId?: string;
  /** Perguntas a usar; no onboarding personalizado vêm do Gemini e podem ser editadas aqui. */
  stages?: OnboardingStage[];
  personalizado?: boolean;
  onRegenerar?: () => void;
}) {
  const [etapas, setEtapas] = useState(stages);
  const [editando, setEditando] = useState<string | null>(null);
  const novas = useRef(0);
  // perguntas novas marcadas para entrar no modelo (próximos onboardings)
  const [paraModelo, setParaModelo] = useState<Set<string>>(new Set());
  const [adicionadas, setAdicionadas] = useState<Set<string>>(new Set());
  const TOTAL_PERGUNTAS = etapas.reduce((n, s) => n + s.questions.length, 0);
  const [state, formAction, pending] = useActionState(saveOnboardingAction, initialState);
  const preselected = preselectedClientId ? clients.find((c) => c.id === preselectedClientId) : undefined;
  const [clientId, setClientId] = useState(preselected?.id ?? clients[0]?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [atual, setAtual] = useState(etapas[0].id);
  const etapasRef = useRef<Record<string, HTMLElement | null>>({});

  const respondidas = (stageId: string) =>
    etapas.find((s) => s.id === stageId)!.questions.filter((q) => answers[q.id]?.trim()).length;
  const totalRespondidas = useMemo(
    () => etapas.reduce((n, s) => n + s.questions.filter((q) => answers[q.id]?.trim()).length, 0),
    [answers, etapas]
  );
  const pct = TOTAL_PERGUNTAS ? Math.round((totalRespondidas / TOTAL_PERGUNTAS) * 100) : 0;

  function mudarPergunta(stageId: string, questionId: string, text: string) {
    setEtapas((es) =>
      es.map((s) => (s.id !== stageId ? s : { ...s, questions: s.questions.map((q) => (q.id === questionId ? { ...q, text } : q)) }))
    );
  }
  function removerPergunta(stageId: string, questionId: string) {
    setEtapas((es) => es.map((s) => (s.id !== stageId ? s : { ...s, questions: s.questions.filter((q) => q.id !== questionId) })));
  }
  function adicionarPergunta(stageId: string) {
    const id = `${stageId}x${++novas.current}`;
    setEtapas((es) => es.map((s) => (s.id !== stageId ? s : { ...s, questions: [...s.questions, { id, text: "" }] })));
    setAdicionadas((a) => new Set(a).add(id));
    setEditando(id);
  }

  // destaca na barra a etapa que está na tela
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel) setAtual(visivel.target.id.replace("etapa-", ""));
      },
      { rootMargin: "-160px 0px -55% 0px" },
    );
    Object.values(etapasRef.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  function irPara(stageId: string) {
    const el = etapasRef.current[stageId];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 130, behavior: "smooth" });
  }

  function handleLimpar() {
    if (!confirm("Tem certeza que deseja limpar todas as respostas?")) return;
    setAnswers({});
  }

  function salvarTxt() {
    const nome = clients.find((c) => c.id === clientId)?.name ?? "cliente";
    const linhas = [`ONBOARDING DA ASSESSORIA JURÍDICA — ${nome}`, `Data: ${new Date().toLocaleDateString("pt-BR")}`, ""];
    for (const s of etapas) {
      linhas.push(`ETAPA ${s.number} — ${s.name.toUpperCase()}`);
      s.questions.forEach((q, i) => {
        linhas.push(`${dois(i + 1)}. ${q.text}`);
        linhas.push(`   ${answers[q.id]?.trim() || "(sem resposta)"}`);
      });
      linhas.push("");
    }
    const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `onboarding-${nome.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <form action={formAction} className="space-y-5" style={{ color: C.ink }}>
      <VoltarInput />
      <input type="hidden" name="questions" value={JSON.stringify(toStored(etapas))} />
      <input
        type="hidden"
        name="perguntas_modelo"
        value={JSON.stringify(
          etapas.flatMap((s) => s.questions.filter((q) => paraModelo.has(q.id) && q.text.trim()).map((q) => ({ stage_id: s.id, texto: q.text.trim() })))
        )}
      />
      {/* ---------- capa ---------- */}
      <section
        className="relative overflow-hidden rounded-3xl px-6 py-7 sm:px-9 sm:py-9"
        style={{ background: `radial-gradient(70% 90% at 85% 20%, ${C.navy3} 0%, ${C.navy2} 45%, ${C.navy} 100%)` }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border"
          style={{ borderColor: "rgba(198,162,79,.18)" }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border p-1.5" style={{ borderColor: "rgba(198,162,79,.35)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática pequena */}
              <img src="/brand/onboarding-mark.png" alt="MC" width={56} height={56} className="h-14 w-14 rounded-full" />
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.25em]" style={{ color: C.gold2 }}>
                {MC_LETTERHEAD.nome}
              </p>
              <p className="text-xl font-semibold tracking-[0.12em] text-white">{MC_LETTERHEAD.subtitulo}</p>
              <p className="mt-0.5 text-[11px] tracking-[0.2em] text-white/60">ONBOARDING DA ASSESSORIA JURÍDICA</p>
            </div>
          </div>
          <div
            className="rounded-2xl border px-4 py-3 text-right text-xs leading-relaxed text-white/75"
            style={{ borderColor: "rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)" }}
          >
            <p>{MC_LETTERHEAD.telefone}</p>
            <p>{MC_LETTERHEAD.email}</p>
            <p>{MC_LETTERHEAD.endereco}</p>
            <p>{MC_LETTERHEAD.cep}</p>
            <p>{MC_LETTERHEAD.oab}</p>
          </div>
        </div>

        <div
          className="relative mx-auto mt-8 max-w-3xl rounded-3xl border p-6 sm:p-7"
          style={{ borderColor: "rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)" }}
        >
          <span
            className="inline-block rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.2em]"
            style={{ borderColor: "rgba(198,162,79,.4)", color: C.gold2 }}
          >
            GUIA DE PERGUNTAS E AÇÕES
          </span>
          <h2 className="mt-4 text-2xl font-medium text-white sm:text-3xl">Onboarding da Assessoria Jurídica</h2>
          {personalizado && (
            <p className="mt-2 text-xs leading-relaxed text-white/70">
              Perguntas geradas pelo Gemini a partir da triagem deste cliente. Dá pra editar, remover ou adicionar antes de começar.
              {onRegenerar && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Gerar as perguntas de novo? As respostas digitadas serão perdidas.")) onRegenerar();
                    }}
                    className="font-semibold underline"
                    style={{ color: C.gold2 }}
                  >
                    Gerar de novo
                  </button>
                </>
              )}
            </p>
          )}

          <label htmlFor="client_id" className="mt-5 block text-[11px] tracking-[0.2em] text-white/60">
            CLIENTE
          </label>
          {preselected ? (
            <>
              <input type="hidden" name="client_id" value={preselected.id} />
              <p className="mt-1 text-base font-medium text-white">{preselected.name}</p>
            </>
          ) : (
            <select
              id="client_id"
              name="client_id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1.5 w-full max-w-sm rounded-xl border bg-white/95 px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: "rgba(255,255,255,.2)", color: C.ink }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <p className="mt-5 text-[11px] tracking-[0.2em] text-white/60">OBJETIVO</p>
          <div
            className="mt-2 rounded-2xl border p-4"
            style={{ borderColor: "rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)" }}
          >
            <p className="text-[11px] font-semibold tracking-[0.18em]" style={{ color: C.gold2 }}>
              IMPLANTAÇÃO COMPLETA
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/85">{ONBOARDING_OBJECTIVE}</p>
          </div>
        </div>
      </section>

      {/* ---------- barra fixa de etapas ---------- */}
      <nav
        aria-label="Etapas do onboarding"
        className="sticky top-0 z-20 rounded-2xl border bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(9,24,39,.08)] backdrop-blur"
        style={{ borderColor: "rgba(17,39,59,.10)" }}
      >
        <div className="flex items-center gap-4">
          <p className="text-sm font-semibold" style={{ color: C.navy }}>
            Etapas do Onboarding
          </p>
          <div className="ml-auto flex w-40 items-center gap-2 sm:w-56">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "#ece6da" }}>
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: C.gold }} />
            </div>
            <span className="w-9 text-right text-xs tabular-nums" style={{ color: C.muted }}>
              {pct}%
            </span>
          </div>
        </div>
        <div className="mt-2.5 grid w-0 min-w-full grid-flow-col auto-cols-[minmax(132px,1fr)] gap-2 overflow-x-auto pb-1">
          {etapas.map((s) => {
            const ativa = atual === s.id;
            const completa = s.questions.length > 0 && respondidas(s.id) === s.questions.length;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => irPara(s.id)}
                aria-current={ativa ? "step" : undefined}
                className="flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] leading-tight transition-colors"
                style={{
                  borderColor: ativa ? "rgba(198,162,79,.55)" : "rgba(17,39,59,.08)",
                  background: ativa ? "#fff" : "#f3efe7",
                  color: C.ink,
                  boxShadow: ativa ? "0 4px 14px rgba(9,24,39,.08)" : undefined,
                }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
                  style={{ background: completa ? C.gold : "#fff", color: completa ? "#fff" : C.navy }}
                >
                  {completa ? "✓" : s.number}
                </span>
                {s.name}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ---------- etapas ---------- */}
      {etapas.map((stage) => {
        const feitas = respondidas(stage.id);
        return (
          <section
            key={stage.id}
            id={`etapa-${stage.id}`}
            ref={(el) => {
              etapasRef.current[stage.id] = el;
            }}
            className="overflow-hidden rounded-3xl border bg-white shadow-[0_20px_60px_rgba(9,24,39,.06)]"
            style={{ borderColor: "rgba(17,39,59,.08)" }}
          >
            <header
              className="flex items-center gap-4 border-b px-5 py-5 sm:px-7"
              style={{ borderColor: "rgba(17,39,59,.08)", background: "linear-gradient(180deg,#fbf9f4,#fff)" }}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white"
                style={{ background: C.navy2 }}
              >
                {stage.number}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.22em]" style={{ color: "#9a7a34" }}>
                  ETAPA {stage.number} DE {etapas.length}
                </p>
                <h3 className="text-lg font-medium sm:text-xl" style={{ color: C.navy }}>
                  {stage.name}
                </h3>
              </div>
              <span
                className="ml-auto shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: "rgba(198,162,79,.35)",
                  background: feitas === stage.questions.length ? C.gold : "#f6efdc",
                  color: feitas === stage.questions.length ? "#fff" : "#7a5f22",
                }}
              >
                {feitas}/{stage.questions.length} respondidas
              </span>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="divide-y px-5 py-2 sm:px-7" style={{ borderColor: "rgba(17,39,59,.08)" }}>
                {stage.questions.map((q, i) => (
                  <div key={q.id} className="py-4">
                    <div className="flex items-start gap-3 text-sm font-medium" style={{ color: C.navy }}>
                      <span
                        className="mt-[-2px] shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold"
                        style={{ background: "#f6efdc", borderColor: "rgba(198,162,79,.3)", color: "#7a5f22" }}
                      >
                        {dois(i + 1)}
                      </span>
                      {editando === q.id ? (
                        <input
                          autoFocus
                          value={q.text}
                          onChange={(e) => mudarPergunta(stage.id, q.id, e.target.value)}
                          onBlur={() => {
                            setEditando(null);
                            if (!q.text.trim()) removerPergunta(stage.id, q.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="Escreva a pergunta..."
                          className="flex-1 rounded-lg border px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2"
                          style={{ borderColor: "rgba(198,162,79,.5)", color: C.navy }}
                        />
                      ) : (
                        <label htmlFor={q.id} className="flex-1">
                          {q.text}
                        </label>
                      )}
                      {editando !== q.id && (
                        <span className="flex shrink-0 gap-2 text-[11px] font-medium" style={{ color: C.muted }}>
                          <button type="button" onClick={() => setEditando(q.id)} className="hover:underline">
                            editar
                          </button>
                          <button
                            type="button"
                            onClick={() => confirm("Remover esta pergunta?") && removerPergunta(stage.id, q.id)}
                            className="hover:underline"
                          >
                            remover
                          </button>
                        </span>
                      )}
                    </div>
                    {adicionadas.has(q.id) && editando !== q.id && q.text.trim() && (
                      <label className="mt-2 ml-10 flex w-fit cursor-pointer items-center gap-2 text-[11.5px]" style={{ color: C.muted }}>
                        <input
                          type="checkbox"
                          checked={paraModelo.has(q.id)}
                          onChange={(e) =>
                            setParaModelo((m) => {
                              const n = new Set(m);
                              if (e.target.checked) n.add(q.id);
                              else n.delete(q.id);
                              return n;
                            })
                          }
                          className="h-3.5 w-3.5"
                          style={{ accentColor: C.gold }}
                        />
                        Usar também nos próximos onboardings
                      </label>
                    )}
                    <div className="relative">
                    <textarea
                      id={q.id}
                      name={q.id}
                      data-onboarding-answer
                      rows={3}
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Digite a resposta ou grave pelo microfone..."
                      className="mt-2.5 w-full rounded-2xl border px-4 py-3 pb-12 text-sm leading-relaxed focus:outline-none focus:ring-2"
                      style={{ borderColor: "rgba(17,39,59,.12)", background: "#fdfcf9", color: C.ink }}
                    />
                    <div className="absolute right-2.5 bottom-3">
                      <AudioAnswer
                        pergunta={q.text}
                        onTexto={(t) =>
                          setAnswers((a) => ({ ...a, [q.id]: a[q.id]?.trim() ? `${a[q.id].trim()}\n${t}` : t }))
                        }
                      />
                    </div>
                    </div>
                  </div>
                ))}
                <div className="py-3">
                  <button
                    type="button"
                    onClick={() => adicionarPergunta(stage.id)}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: "#9a7a34" }}
                  >
                    + Adicionar pergunta
                  </button>
                </div>
              </div>

              <aside className="border-t p-4 lg:border-l lg:border-t-0" style={{ borderColor: "rgba(17,39,59,.08)", background: "#f8f5ef" }}>
                <div className="rounded-2xl border bg-white p-4 lg:sticky lg:top-40" style={{ borderColor: "rgba(17,39,59,.06)" }}>
                  <p className="text-[11px] font-semibold tracking-[0.2em]" style={{ color: "#9a7a34" }}>
                    AÇÕES A SEREM REALIZADAS
                  </p>
                  <ul className="mt-2">
                    {stage.actions.map((acao, i) => (
                      <li
                        key={i}
                        className="flex gap-2 border-b py-2.5 text-[13px] leading-snug last:border-0"
                        style={{ borderColor: "rgba(17,39,59,.07)", color: C.muted }}
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.gold }} />
                        {acao}
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </section>
        );
      })}

      {/* ---------- fechamento ---------- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { titulo: "Informações Essenciais", itens: ONBOARDING_INFO_ESSENCIAIS },
          { titulo: "Checklist de Conclusão do Onboarding", itens: ONBOARDING_CHECKLIST_CONCLUSAO },
        ].map((bloco) => (
          <div key={bloco.titulo} className="rounded-3xl border bg-white p-6" style={{ borderColor: "rgba(17,39,59,.08)" }}>
            <h3 className="text-base font-medium" style={{ color: C.navy }}>
              {bloco.titulo}
            </h3>
            <ul className="mt-3 space-y-2">
              {bloco.itens.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-snug" style={{ color: C.muted }}>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.gold }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        className="rounded-3xl p-7 text-center"
        style={{ background: `linear-gradient(135deg, ${C.navy2}, ${C.navy})` }}
      >
        <p className="text-[11px] font-semibold tracking-[0.25em]" style={{ color: C.gold2 }}>
          REGRA DE OURO MC
        </p>
        <p className="mx-auto mt-3 max-w-xl text-base text-white/85">{ONBOARDING_REGRA_OURO.text}</p>
        <p className="mt-2 text-lg font-semibold tracking-wide" style={{ color: C.gold2 }}>
          {ONBOARDING_REGRA_OURO.destaque}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border bg-white p-6" style={{ borderColor: "rgba(17,39,59,.08)" }}>
        <div className="text-xs leading-relaxed" style={{ color: C.muted }}>
          <p className="mb-1 text-sm font-medium" style={{ color: C.navy }}>
            Contato
          </p>
          <p>{MC_LETTERHEAD.telefone} · {MC_LETTERHEAD.email}</p>
          <p>
            {MC_LETTERHEAD.endereco} · {MC_LETTERHEAD.cep} · {MC_LETTERHEAD.oab}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MC_FOOTER_VALORES.map((v) => (
            <span
              key={v.text}
              className="rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-wider"
              style={{ borderColor: "rgba(198,162,79,.35)", color: "#7a5f22", background: "#fbf7ec" }}
            >
              {v.text}
            </span>
          ))}
        </div>
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      {/* ---------- ações (fixas no rodapé da tela) ---------- */}
      <div className="sticky bottom-3 z-20 flex flex-wrap justify-end gap-1.5 pb-1 sm:gap-2">
        <button
          type="button"
          onClick={salvarTxt}
          className="rounded-xl px-3 py-2 text-xs font-semibold sm:px-4 sm:py-2.5 sm:text-sm text-white shadow-lg"
          style={{ background: C.navy2 }}
        >
          <span className="sm:hidden">TXT</span>
          <span className="hidden sm:inline">Salvar respostas em TXT</span>
        </button>
        <button
          type="button"
          onClick={handleLimpar}
          className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold sm:px-4 sm:py-2.5 sm:text-sm shadow-lg"
          style={{ borderColor: "rgba(17,39,59,.12)", color: C.navy }}
        >
          <span className="sm:hidden">Limpar</span>
          <span className="hidden sm:inline">Limpar respostas</span>
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl px-4 py-2 text-xs font-semibold sm:px-5 sm:py-2.5 sm:text-sm shadow-lg disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.gold2})`, color: C.navy }}
        >
          {pending ? "Salvando..." : "Salvar onboarding (gera PDF)"}
        </button>
      </div>
    </form>
  );
}

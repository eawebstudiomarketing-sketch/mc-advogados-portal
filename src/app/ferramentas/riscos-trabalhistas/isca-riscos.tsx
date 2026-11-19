"use client";

import { useRef, useState } from "react";
import { diagnosticar, PERGUNTAS, TAMANHOS, type Diagnostico, type Resposta } from "@/lib/iscas/riscos";
import { BotaoOuro, BotaoZap, CaixaLead, COR_NIVEL, Medidor, Moldura, OURO, Titulo, useIsca } from "../comum";


const NIVEL = {
  baixo: { rotulo: "Risco baixo", titulo: "Sua empresa está bem cuidada.", texto: "Poucos pontos de atenção. Vale manter a rotina em dia e revisar o que apareceu." },
  medio: { rotulo: "Risco médio", titulo: "Tem porta aberta para processo.", texto: "Alguns pontos podem virar ação trabalhista. Dá para corrigir com calma, antes que alguém reclame." },
  alto: { rotulo: "Risco alto", titulo: "Sua empresa está exposta.", texto: "Os pontos que apareceram são os que mais geram condenação. Corrigir agora sai muito mais barato do que depois." },
} as const;

// 19/11/2026: o mesmo diagnóstico substitui o quiz antigo /f/riscos-juridicos (pedido do Maurício),
// com a foto da equipe no início; lá o lead vai para o formulário riscos-juridicos.
export function IscaRiscos({ slug = "isca-riscos", foto }: { slug?: string; foto?: string }) {
  const { evento, comecou, enviarLead, armadilha } = useIsca(slug, PERGUNTAS.length + 1);
  // -1 = início; 0 = tamanho; 1..n = perguntas; n+1 = resultado
  const [tela, setTela] = useState(-1);
  const [tamanho, setTamanho] = useState("");
  const [resp, setResp] = useState<Record<string, Resposta>>({});
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [liberado, setLiberado] = useState(false);
  const topoRef = useRef<HTMLDivElement>(null);
  const n = PERGUNTAS.length;

  const ir = (t: number) => {
    setTela(t);
    requestAnimationFrame(() => topoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  function comecar() {
    comecou();
    ir(0);
  }
  function responder(id: string, r: Resposta, i: number) {
    const novas = { ...resp, [id]: r };
    setResp(novas);
    if (i + 1 < n) return setTimeout(() => ir(i + 2), 180);
    setDiag(diagnosticar(novas));
    setTimeout(() => ir(n + 1), 180);
  }

  async function lead(nome: string, telefone: string) {
    if (!diag) return "Responda o diagnóstico primeiro.";
    const resumo = [
      `${NIVEL[diag.nivel].rotulo} · nota ${diag.nota}/100 · ${diag.pontos.length} ponto(s) de atenção`,
      ...diag.pontos.map((p) => `• ${p.ponto}`),
      "",
      "Respostas:",
      ...PERGUNTAS.map((p) => `${p.texto} → ${resp[p.id] === "sim" ? "Sim" : resp[p.id] === "nao" ? "Não" : "Não se aplica"}`),
    ].join("\n");
    const falha = await enviarLead({ funcionarios: tamanho, resultado: resumo, nome, telefone });
    if (!falha) setLiberado(true);
    return falha;
  }

  const p = tela >= 1 && tela <= n ? PERGUNTAS[tela - 1] : null;
  const opcao = (ativo: boolean) =>
    `min-h-16 w-full rounded-2xl border-2 px-5 py-3 text-lg font-black transition active:scale-[0.98] ${ativo ? "border-[#c9a557] bg-[#c9a557]/20" : "border-white/12 bg-white/[0.06] hover:border-white/30"}`;

  return (
    <Moldura>
      <div ref={topoRef} className="scroll-mt-4" />
      <input ref={armadilha} name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      {tela === -1 && (
        <>
          {foto && (
            <div className="relative -mx-4 -mt-4 mb-8 overflow-hidden sm:mx-0 sm:rounded-[28px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt="Equipe da MC Advogados" className="aspect-[1080/760] w-full object-cover object-top" />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#07111f] to-transparent" aria-hidden />
            </div>
          )}
          <Titulo antes={<>Sua empresa está</>} destaque="protegida" depois="?" sub="12 perguntas rápidas de sim ou não. No fim você vê onde está o risco de processo trabalhista." />
          <div className="mt-8 space-y-3">
            <BotaoOuro type="button" onClick={comecar}>
              Fazer o diagnóstico
            </BotaoOuro>
            <p className="text-center text-[13px] text-white/45">Grátis · leva uns 2 minutos</p>
          </div>
        </>
      )}

      {tela >= 0 && tela <= n && (
        <div>
          <div className="mb-8">
            <div className="flex justify-between text-[13px] font-bold text-white/55">
              <span>{tela === 0 ? "Antes de começar" : `Pergunta ${tela} de ${n}`}</span>
              {tela > 0 && (
                <button type="button" onClick={() => ir(tela - 1)} className="text-white/55 hover:text-white">
                  ← Voltar
                </button>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(tela / n) * 100}%`, background: OURO }} />
            </div>
          </div>

          {tela === 0 ? (
            <>
              <h2 className="font-[family-name:var(--font-playfair)] text-[2rem] leading-tight font-extrabold">Quantos funcionários a empresa tem?</h2>
              <div className="mt-6 grid grid-cols-2 gap-2">
                {TAMANHOS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={opcao(tamanho === t)}
                    onClick={() => {
                      setTamanho(t);
                      setTimeout(() => ir(1), 180);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          ) : (
            p && (
              <div key={p.id}>
                <h2 className="font-[family-name:var(--font-playfair)] text-[1.75rem] leading-tight font-extrabold text-balance">{p.texto}</h2>
                <div className="mt-6 space-y-2">
                  <button type="button" className={opcao(resp[p.id] === "sim")} onClick={() => responder(p.id, "sim", tela - 1)}>
                    Sim
                  </button>
                  <button type="button" className={opcao(resp[p.id] === "nao")} onClick={() => responder(p.id, "nao", tela - 1)}>
                    Não
                  </button>
                  {p.naoSeAplica && (
                    <button type="button" className={`${opcao(resp[p.id] === "na")} !text-base !font-bold text-white/70`} onClick={() => responder(p.id, "na", tela - 1)}>
                      Não se aplica
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {tela === n + 1 && diag && (
        <div>
          <section className="rounded-[28px] bg-white px-5 pt-6 pb-6 text-[#0b1626] shadow-2xl">
            <p className="text-center text-[13px] font-bold tracking-[0.2em] text-[#0b1626]/50 uppercase">Seu diagnóstico</p>
            <Medidor nivel={diag.nivel} />
            <p className="-mt-1 text-center text-sm font-black tracking-[0.18em] uppercase" style={{ color: COR_NIVEL[diag.nivel] }}>
              {NIVEL[diag.nivel].rotulo}
            </p>
            <h2 className="mt-3 text-center font-[family-name:var(--font-playfair)] text-[1.85rem] leading-tight font-extrabold">{NIVEL[diag.nivel].titulo}</h2>
            <p className="mx-auto mt-2 max-w-sm text-center text-[16px] leading-snug text-[#0b1626]/70">{NIVEL[diag.nivel].texto}</p>

            {diag.pontos.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[13px] font-bold tracking-[0.12em] text-[#0b1626]/50 uppercase">
                  {diag.pontos.length === 1 ? "1 ponto de atenção" : `${diag.pontos.length} pontos de atenção`}
                </p>
                <ul className="space-y-2">
                  {diag.pontos.map((x, i) => {
                    const aberto = liberado || i < 3;
                    return (
                      <li key={x.id} className="rounded-2xl bg-[#f3f1ec] px-4 py-3.5">
                        <span className={`flex items-start justify-between gap-3 ${aberto ? "" : "blur-[6px] select-none"}`} aria-hidden={!aberto}>
                          <span className="text-[16px] font-black leading-snug">{x.ponto}</span>
                          <span
                            className="mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold text-white"
                            style={{ background: x.peso === 3 ? COR_NIVEL.alto : x.peso === 2 ? "#e39a22" : "#8a94a3" }}
                          >
                            {x.peso === 3 ? "Grave" : x.peso === 2 ? "Atenção" : "Ajuste"}
                          </span>
                        </span>
                        {liberado ? (
                          <span className="mt-1.5 block text-[14px] leading-snug text-[#0b1626]/70">{x.fazer}</span>
                        ) : (
                          <span className="mt-1.5 block text-[14px] leading-snug text-[#0b1626]/70 blur-[5px] select-none" aria-hidden>
                            {x.fazer}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {!liberado && <p className="mt-3 text-center text-[14px] font-bold text-[#0b1626]/70">🔒 O que fazer em cada ponto está no plano completo</p>}
              </div>
            )}
          </section>

          {!liberado ? (
            <CaixaLead
              titulo={diag.pontos.length ? "Receba o plano para corrigir." : "Quer manter assim?"}
              texto="Libere agora o que fazer em cada ponto. Um advogado trabalhista também te chama no WhatsApp para tirar dúvidas, sem custo."
              botao="Liberar meu plano grátis"
              pronto={() => "Plano liberado acima."}
              onEnviar={lead}
            />
          ) : (
            <div className="mt-5 rounded-[28px] bg-[#41c28a]/12 p-5 text-center text-[15px] leading-snug text-white/80">
              Plano liberado acima. Em breve um advogado trabalhista te chama no WhatsApp.
            </div>
          )}
          <BotaoZap mensagem="Olá! Fiz o diagnóstico trabalhista no site de vocês e quero ajuda para proteger minha empresa." onClick={() => evento(["Contact", "WhatsAppClick"], true)} />
          <button type="button" onClick={() => ir(-1)} className="mt-6 w-full text-center text-[14px] font-bold text-white/50 hover:text-white">
            Refazer o diagnóstico
          </button>
        </div>
      )}
    </Moldura>
  );
}

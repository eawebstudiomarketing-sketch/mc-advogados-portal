"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RAMOS } from "@/lib/iscas/ramos";

type Parecida = { marca: string; classe: string; situacao: string; parecenca: number };
type Previa = { marca: string; ramo: string; risco: "baixo" | "medio" | "alto"; parecidas: Parecida[]; total: number; classes: string[] };

const SLUG = "isca-marca";
const ZAP = "5573998469554";
const OURO = "#c9a557";
const idAleatorio = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, "");

// v2 (18/11/2026): texto de gente, sem falar de INPI/base/classe na tela
const RISCO = {
  baixo: {
    rotulo: "Risco baixo",
    cor: "#41c28a",
    angulo: -58,
    titulo: "Caminho livre, por enquanto.",
    texto: "Ninguém está usando um nome parecido no seu ramo. O próximo passo é registrar antes que alguém tenha a mesma ideia.",
  },
  medio: {
    rotulo: "Risco médio",
    cor: "#f0b23e",
    angulo: 0,
    titulo: "Tem gente parecida no caminho.",
    texto: "Existem marcas com nome parecido no seu ramo. Dá para registrar, mas o jeito de pedir faz toda a diferença.",
  },
  alto: {
    rotulo: "Risco alto",
    cor: "#ef5a4f",
    angulo: 58,
    titulo: "Alguém chegou antes.",
    texto: "Já existe marca quase igual à sua no seu ramo. Pedir o registro do jeito que está tende a ser negado, e usar sem registro pode dar dor de cabeça.",
  },
} as const;

const PASSOS = ["Procurando nomes iguais…", "Comparando grafias e sons parecidos…", "Olhando os concorrentes do seu ramo…", "Calculando o risco…"];

const nivel = (p: number) => (p >= 0.85 ? "Quase idêntica" : p >= 0.65 ? "Muito parecida" : "Parecida");
const status = (s: string) => (/vigor|deferido/i.test(s) ? "Já registrada" : "Pedido em andamento");

function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Medidor (semicírculo verde → amarelo → vermelho) com o ponteiro no risco. */
function Medidor({ risco }: { risco: Previa["risco"] }) {
  const [ang, setAng] = useState(-90);
  useEffect(() => {
    const t = setTimeout(() => setAng(RISCO[risco].angulo), 80);
    return () => clearTimeout(t);
  }, [risco]);
  const arco = (de: number, ate: number) => {
    const p = (a: number) => [100 + 80 * Math.cos(((a - 180) * Math.PI) / 180), 100 + 80 * Math.sin(((a - 180) * Math.PI) / 180)];
    const [x1, y1] = p(de);
    const [x2, y2] = p(ate);
    return `M ${x1} ${y1} A 80 80 0 0 1 ${x2} ${y2}`;
  };
  return (
    <svg viewBox="0 0 200 118" className="mx-auto w-full max-w-[260px]" aria-hidden>
      <path d={arco(2, 58)} stroke="#41c28a" strokeWidth="16" fill="none" strokeLinecap="round" opacity={risco === "baixo" ? 1 : 0.28} />
      <path d={arco(62, 118)} stroke="#f0b23e" strokeWidth="16" fill="none" strokeLinecap="round" opacity={risco === "medio" ? 1 : 0.28} />
      <path d={arco(122, 178)} stroke="#ef5a4f" strokeWidth="16" fill="none" strokeLinecap="round" opacity={risco === "alto" ? 1 : 0.28} />
      <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: "100px 100px", transition: "transform 1.1s cubic-bezier(.22,1.4,.36,1)" }}>
        <line x1="100" y1="100" x2="100" y2="34" stroke="#0b1626" strokeWidth="5" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="10" fill="#0b1626" />
      <circle cx="100" cy="100" r="4" fill="#fff" />
    </svg>
  );
}

export function IscaMarca() {
  const [marca, setMarca] = useState("");
  const [ramo, setRamo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [nome, setNome] = useState("");
  const [fone, setFone] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const sessao = useRef("");
  const visitante = useRef("");
  const armadilha = useRef<HTMLInputElement>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);

  const api = useCallback((corpo: Record<string, unknown>, beacon = false) => {
    const txt = JSON.stringify({ sessao: sessao.current, ...corpo });
    if (beacon && navigator.sendBeacon) return void navigator.sendBeacon(`/api/f/${SLUG}`, new Blob([txt], { type: "application/json" }));
    return void fetch(`/api/f/${SLUG}`, { method: "POST", headers: { "content-type": "application/json" }, body: txt, keepalive: true }).catch(() => null);
  }, []);
  const evento = useCallback(
    (nomes: string[], beacon = false) => api({ visitante: visitante.current || sessao.current, eventos: nomes.map((n) => ({ nome: n })) }, beacon),
    [api],
  );

  useEffect(() => {
    try {
      sessao.current = sessionStorage.getItem(`mc:f:${SLUG}`) ?? "";
      if (!sessao.current) sessionStorage.setItem(`mc:f:${SLUG}`, (sessao.current = idAleatorio()));
      visitante.current = localStorage.getItem("mc:visitante") ?? "";
      if (!visitante.current) localStorage.setItem("mc:visitante", (visitante.current = idAleatorio()));
    } catch {
      sessao.current ||= idAleatorio();
      visitante.current = sessao.current;
    }
    const q = new URLSearchParams(location.search);
    const utm = Object.fromEntries(["source", "medium", "campaign", "content", "term"].map((k) => [k, q.get(`utm_${k}`) ?? ""]).filter(([, v]) => v));
    api({ passo: "abriu" });
    api({ rastro: { visita: sessao.current, visitante: visitante.current, passo: -1, total: 2, utm, fbclid: q.has("fbclid"), gclid: q.has("gclid"), referrer: document.referrer } });
    evento(["PageView", "ViewContent"]);
  }, [api, evento]);

  // enquanto procura, mostra o que está fazendo (passo a passo)
  useEffect(() => {
    if (!carregando || previa) return;
    const t = setInterval(() => setPasso((p) => Math.min(p + 1, PASSOS.length - 1)), 700);
    return () => clearInterval(t);
  }, [carregando, previa]);

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (marca.trim().length < 2) return setErro("Digite o nome da sua marca.");
    if (!ramo) return setErro("Escolha o ramo do seu negócio.");
    setPrevia(null);
    setEnviado(false);
    setPasso(0);
    setCarregando(true);
    api({ passo: "comecou" });
    evento(["FormStart"]);
    const inicio = Date.now();
    try {
      const r = await fetch("/api/ferramentas/marca", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marca, ramo, site: armadilha.current?.value ?? "" }) });
      const j = await r.json();
      // deixa o passo a passo aparecer um pouco (resposta rápida demais parece que não procurou)
      const falta = 2200 - (Date.now() - inicio);
      if (falta > 0) await new Promise((ok) => setTimeout(ok, falta));
      if (!r.ok) return setErro(j.erro ?? "Não deu certo agora. Tente de novo.");
      setPrevia(j as Previa);
      api({ eventos: [{ nome: "FormFieldComplete", pergunta: 1, campo: "marca" }], visitante: visitante.current });
      requestAnimationFrame(() => resultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  async function pedirRelatorio(e: React.FormEvent) {
    e.preventDefault();
    if (!previa) return;
    setErro(null);
    if (nome.trim().length < 2) return setErro("Digite seu nome.");
    if (fone.replace(/\D/g, "").length < 10) return setErro("Digite seu WhatsApp com DDD.");
    setCarregando(true);
    const q = new URLSearchParams(location.search);
    const utm = Object.fromEntries(["source", "medium", "campaign", "content", "term"].map((k) => [k, q.get(`utm_${k}`) ?? ""]).filter(([, v]) => v));
    // no lead vai tudo (classe, situação, %) para a equipe analisar
    const resumo = [
      `${RISCO[previa.risco].rotulo} (prévia automática, classes ${previa.classes.join(", ")})`,
      previa.total ? `${previa.total} marca(s) parecida(s) ativa(s). Mais parecidas:` : "Nenhuma marca parecida ativa encontrada no ramo.",
      ...previa.parecidas.map((p) => `• ${p.marca} — classe ${p.classe} — ${p.situacao} (${Math.round(p.parecenca * 100)}% parecida)`),
    ].join("\n");
    evento(["FormSubmit"]);
    try {
      const r = await fetch(`/api/f/${SLUG}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessao: sessao.current,
          enviar: true,
          respostas: { marca: previa.marca, ramo: previa.ramo, previa: resumo, nome: nome.trim(), telefone: fone },
          eventId: `lead-${idAleatorio()}`,
          utm,
          rastreio: { visitante: visitante.current, pagina: location.href, referrer: document.referrer },
          site: armadilha.current?.value ?? "",
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar agora. Tente de novo.");
      setEnviado(true);
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  const linkZap = `https://wa.me/${ZAP}?text=${encodeURIComponent(
    previa ? `Olá! Pesquisei a marca "${previa.marca}" no site de vocês e quero ajuda para registrar.` : "Olá! Quero ajuda para registrar minha marca.",
  )}`;
  const cliqueZap = () => evento(["Contact", "WhatsAppClick"], true);
  const r = previa ? RISCO[previa.risco] : null;
  const campo = "w-full rounded-2xl border-2 border-white/12 bg-white/[0.06] px-5 text-[17px] text-white placeholder:text-white/40 transition focus:border-[#c9a557] focus:bg-white/[0.09] focus:outline-none";

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#07111f] font-[family-name:var(--font-lato)] text-white">
      {/* brilho dourado discreto atrás do título */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_55%_at_50%_0%,rgba(201,165,87,0.16),transparent_70%)]" aria-hidden />
      <div className="relative mx-auto w-full max-w-lg px-4 pt-7 pb-16 sm:pt-12">
        <header className="mb-10 flex items-center justify-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo_mc.jpg" alt="" className="h-8 w-8 rounded-full object-cover" />
          <span className="text-[13px] font-bold tracking-[0.28em] text-white/80">MC ADVOGADOS</span>
        </header>

        <h1 className="text-center font-[family-name:var(--font-playfair)] text-[2.7rem] leading-[1.02] font-extrabold tracking-tight sm:text-[3.4rem]">
          Sua marca
          <br />
          está <em style={{ color: OURO }}>livre</em>?
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-center text-[17px] leading-snug text-white/70">Digite o nome. Em segundos você descobre se alguém chegou antes.</p>

        <form onSubmit={consultar} className="mt-8 space-y-3">
          <input value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={60} placeholder="Nome da sua marca" className={`${campo} h-16 text-center text-xl font-bold`} autoComplete="off" />
          <div className="relative">
            <select value={ramo} onChange={(e) => setRamo(e.target.value)} className={`${campo} h-14 appearance-none pr-12 ${ramo ? "" : "text-white/45"}`}>
              <option value="" className="bg-[#07111f]">
                Qual o ramo do seu negócio?
              </option>
              {RAMOS.map((x) => (
                <option key={x.id} value={x.id} className="bg-[#07111f] text-white">
                  {x.nome}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 text-white/50" aria-hidden>
              ▾
            </span>
          </div>
          <input ref={armadilha} name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <button
            type="submit"
            disabled={carregando && !previa}
            className="h-16 w-full rounded-2xl text-lg font-black text-[#07111f] shadow-[0_10px_30px_-10px_rgba(201,165,87,0.7)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-80"
            style={{ background: OURO }}
          >
            {carregando && !previa ? "Procurando…" : previa ? "Pesquisar outra marca" : "Descobrir agora"}
          </button>
          {erro && !previa && <p className="text-center text-sm text-[#ff8a80]">{erro}</p>}
          {!previa && !carregando && <p className="pt-1 text-center text-[13px] text-white/45">Grátis · sem cadastro para ver o resultado</p>}
        </form>

        {carregando && !previa && (
          <div className="mt-8 rounded-3xl bg-white/[0.05] p-6 text-center">
            <div className="mx-auto h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${((passo + 1) / PASSOS.length) * 100}%`, background: OURO }} />
            </div>
            <p className="mt-4 text-[15px] text-white/80">{PASSOS[passo]}</p>
          </div>
        )}

        {previa && r && (
          <div ref={resultadoRef} className="mt-10 scroll-mt-4">
            <section className="rounded-[28px] bg-white px-5 pt-6 pb-6 text-[#0b1626] shadow-2xl">
              <p className="text-center text-[13px] font-bold tracking-[0.2em] text-[#0b1626]/50 uppercase">{previa.marca}</p>
              <Medidor risco={previa.risco} />
              <p className="-mt-1 text-center text-sm font-black tracking-[0.18em] uppercase" style={{ color: r.cor }}>
                {r.rotulo}
              </p>
              <h2 className="mt-3 text-center font-[family-name:var(--font-playfair)] text-[1.85rem] leading-tight font-extrabold">{r.titulo}</h2>
              <p className="mx-auto mt-2 max-w-sm text-center text-[16px] leading-snug text-[#0b1626]/70">{r.texto}</p>

              {previa.parecidas.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-[13px] font-bold tracking-[0.12em] text-[#0b1626]/50 uppercase">Quem pode bater de frente com você</p>
                  <ul className="space-y-2">
                    {previa.parecidas.map((p) => (
                      <li key={`${p.marca}-${p.classe}`} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f3f1ec] px-4 py-3.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[17px] font-black">{p.marca}</span>
                          <span className="block text-[13px] text-[#0b1626]/55">{status(p.situacao)}</span>
                        </span>
                        <span
                          className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold text-white"
                          style={{ background: p.parecenca >= 0.85 ? "#ef5a4f" : p.parecenca >= 0.65 ? "#e39a22" : "#8a94a3" }}
                        >
                          {nivel(p.parecenca)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {previa.total > previa.parecidas.length && (
                    <p className="mt-3 text-center text-[14px] font-bold text-[#0b1626]/70">
                      + {previa.total - previa.parecidas.length} {previa.total - previa.parecidas.length === 1 ? "outra marca parecida" : "outras marcas parecidas"} no relatório completo
                    </p>
                  )}
                </div>
              )}
            </section>

            {!enviado ? (
              <form onSubmit={pedirRelatorio} className="mt-5 rounded-[28px] border border-[#c9a557]/45 bg-[#c9a557]/[0.08] p-5">
                <h3 className="font-[family-name:var(--font-playfair)] text-[1.6rem] leading-tight font-extrabold">
                  {previa.risco === "baixo" ? "Garanta o nome antes de alguém." : "Quer saber como registrar mesmo assim?"}
                </h3>
                <p className="mt-2 text-[15px] leading-snug text-white/75">
                  Um advogado especialista analisa sua marca e te manda no WhatsApp o relatório completo e o melhor caminho. Sem custo.
                </p>
                <div className="mt-4 space-y-3">
                  <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" autoComplete="name" className={`${campo} h-14`} />
                  <input
                    value={fone}
                    onChange={(e) => setFone(mascaraTelefone(e.target.value))}
                    placeholder="Seu WhatsApp com DDD"
                    inputMode="tel"
                    autoComplete="tel"
                    className={`${campo} h-14`}
                  />
                  <button
                    type="submit"
                    disabled={carregando}
                    className="h-16 w-full rounded-2xl bg-white text-lg font-black text-[#07111f] transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-70"
                  >
                    {carregando ? "Enviando…" : "Quero meu relatório grátis"}
                  </button>
                  {erro && <p className="text-center text-sm text-[#ff8a80]">{erro}</p>}
                </div>
              </form>
            ) : (
              <div className="mt-5 rounded-[28px] bg-[#41c28a]/12 p-6 text-center">
                <p className="text-4xl" aria-hidden>
                  ✓
                </p>
                <p className="mt-1 font-[family-name:var(--font-playfair)] text-[1.6rem] font-extrabold">Pronto, {nome.trim().split(" ")[0]}!</p>
                <p className="mt-1 text-[15px] leading-snug text-white/75">Em breve um especialista te chama no WhatsApp com o relatório da “{previa.marca}”.</p>
              </div>
            )}

            <a
              href={linkZap}
              target="_blank"
              rel="noopener noreferrer"
              onClick={cliqueZap}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25d366] text-[16px] font-black text-[#07111f] transition hover:brightness-105 active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1 2.7 11.5 11.5 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.6-.3Z" />
              </svg>
              Falar agora no WhatsApp
            </a>
          </div>
        )}

        <footer className="mt-14 text-center text-xs text-white/35">© MC Advogados</footer>
      </div>
    </main>
  );
}

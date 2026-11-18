"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RAMOS } from "@/lib/iscas/ramos";

type Parecida = { marca: string; classe: string; situacao: string; parecenca: number };
type Previa = { marca: string; ramo: string; risco: "baixo" | "medio" | "alto"; parecidas: Parecida[]; total: number; classes: string[] };

const SLUG = "isca-marca";
const ZAP = "5573998469554";
const idAleatorio = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, "");

const RISCO = {
  baixo: { rotulo: "Risco baixo", cor: "#3fb97a", texto: "Não achamos marcas muito parecidas ativas no seu ramo. É um bom sinal, mas o INPI também olha marcas de ramos próximos e o desenho do logo." },
  medio: { rotulo: "Risco médio", cor: "#e3b341", texto: "Existem marcas parecidas no seu ramo. Dá para registrar em muitos casos, mas precisa de estratégia (ajuste no nome, classe certa, logo)." },
  alto: { rotulo: "Risco alto", cor: "#e5534b", texto: "Existe marca muito parecida ativa no seu ramo. Registrar assim tem grande chance de ser negado, e usar sem registro pode gerar problema." },
} as const;

function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function IscaMarca() {
  const [marca, setMarca] = useState("");
  const [ramo, setRamo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [nome, setNome] = useState("");
  const [fone, setFone] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);
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

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (marca.trim().length < 2) return setErro("Digite o nome da marca.");
    if (!ramo) return setErro("Escolha o ramo do seu negócio.");
    setCarregando(true);
    api({ passo: "comecou" });
    evento(["FormStart"]);
    try {
      const r = await fetch("/api/ferramentas/marca", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marca, ramo, site: armadilha.current?.value ?? "" }) });
      const j = await r.json();
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
    previa ? `Olá! Consultei a marca "${previa.marca}" na ferramenta de vocês e quero falar com um especialista sobre o registro.` : "Olá! Quero falar com um especialista sobre registro de marca.",
  )}`;
  const cliqueZap = () => evento(["Contact", "WhatsAppClick"], true);

  return (
    <main className="min-h-dvh bg-[#061021] font-[family-name:var(--font-lato)] text-white">
      <div className="mx-auto w-full max-w-xl px-4 pt-8 pb-16 sm:pt-14">
        <header className="mb-8 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo_mc.jpg" alt="MC Advogados" className="h-10 w-10 rounded-full object-cover" />
          <span className="text-sm tracking-[0.2em] text-[#c6a24f] uppercase">MC Advogados</span>
        </header>

        <p className="mb-2 text-xs font-bold tracking-[0.18em] text-[#c6a24f] uppercase">Consulta grátis</p>
        <h1 className="text-[2rem] leading-[1.1] font-black text-balance sm:text-[2.6rem]">Sua marca pode ser registrada?</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-white/75">
          Digite o nome e o ramo do seu negócio. Em segundos mostramos se já existem marcas parecidas no INPI e o risco de registro.
        </p>

        <form onSubmit={consultar} className="mt-7 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Nome da marca</span>
            <input
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              maxLength={60}
              placeholder="Ex.: Doce Encanto"
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-[#c6a24f] focus:outline-none"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Ramo do negócio</span>
            <select
              value={ramo}
              onChange={(e) => setRamo(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base text-white focus:border-[#c6a24f] focus:outline-none"
            >
              <option value="" className="bg-[#061021]">
                Escolha o ramo
              </option>
              {RAMOS.map((r) => (
                <option key={r.id} value={r.id} className="bg-[#061021]">
                  {r.nome}
                </option>
              ))}
            </select>
          </label>
          <input ref={armadilha} name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <button
            type="submit"
            disabled={carregando && !previa}
            className="w-full rounded-xl bg-[#c6a24f] px-5 py-3.5 text-base font-black text-[#061021] transition hover:bg-[#d4b467] active:scale-[0.99] disabled:opacity-60"
          >
            {carregando && !previa ? "Consultando o INPI…" : previa ? "Consultar outra marca" : "Ver se minha marca está livre"}
          </button>
          {erro && !previa && <p className="text-sm text-[#ff8a80]">{erro}</p>}
        </form>

        {previa && (
          <div ref={resultadoRef} className="mt-8 scroll-mt-6">
            <div className="rounded-2xl border p-5" style={{ borderColor: `${RISCO[previa.risco].cor}66`, background: `${RISCO[previa.risco].cor}14` }}>
              <p className="text-xs font-bold tracking-[0.15em] text-white/60 uppercase">Prévia para “{previa.marca}”</p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-black" style={{ color: RISCO[previa.risco].cor }}>
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: RISCO[previa.risco].cor }} aria-hidden />
                {RISCO[previa.risco].rotulo}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-white/80">{RISCO[previa.risco].texto}</p>

              {previa.parecidas.length > 0 && (
                <ul className="mt-4 divide-y divide-white/10 rounded-xl bg-black/25">
                  {previa.parecidas.map((p) => (
                    <li key={`${p.marca}-${p.classe}`} className="flex items-start justify-between gap-3 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{p.marca}</span>
                        <span className="block text-xs text-white/55">
                          Classe {p.classe} · {p.situacao}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-white/80">{Math.round(p.parecenca * 100)}%</span>
                    </li>
                  ))}
                </ul>
              )}
              {previa.total > previa.parecidas.length && (
                <p className="mt-2 text-xs text-white/55">+ {previa.total - previa.parecidas.length} outra(s) marca(s) parecida(s) no relatório completo.</p>
              )}
              <p className="mt-4 text-xs leading-relaxed text-white/45">
                Prévia automática feita pelo nome, nas classes do ramo ({previa.classes.join(", ")}). Não substitui a análise de um especialista: o INPI também
                avalia o logo, ramos próximos e marcas famosas.
              </p>
            </div>

            {!enviado ? (
              <form onSubmit={pedirRelatorio} className="mt-6 space-y-4 rounded-2xl border border-[#c6a24f]/40 bg-white/[0.04] p-5">
                <div>
                  <p className="text-lg font-black">Receba o relatório completo grátis</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/70">
                    Um especialista analisa sua marca (classes certas, logo, chances no INPI e o que fazer) e te envia pelo WhatsApp.
                  </p>
                </div>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-[#c6a24f] focus:outline-none"
                />
                <input
                  value={fone}
                  onChange={(e) => setFone(mascaraTelefone(e.target.value))}
                  placeholder="WhatsApp com DDD"
                  inputMode="tel"
                  autoComplete="tel"
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-[#c6a24f] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={carregando}
                  className="w-full rounded-xl bg-white px-5 py-3.5 text-base font-black text-[#061021] transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-60"
                >
                  {carregando ? "Enviando…" : "Quero o relatório completo"}
                </button>
                {erro && <p className="text-sm text-[#ff8a80]">{erro}</p>}
              </form>
            ) : (
              <div className="mt-6 rounded-2xl border border-[#3fb97a]/50 bg-[#3fb97a]/10 p-5">
                <p className="text-lg font-black">Pedido recebido, {nome.trim().split(" ")[0]}!</p>
                <p className="mt-1 text-sm leading-relaxed text-white/75">Um especialista vai analisar “{previa.marca}” e te enviar o relatório completo pelo WhatsApp em breve.</p>
              </div>
            )}

            <a
              href={linkZap}
              target="_blank"
              rel="noopener noreferrer"
              onClick={cliqueZap}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-3.5 text-base font-bold text-white transition hover:bg-white/5"
            >
              Falar com um especialista agora
            </a>
          </div>
        )}

        <footer className="mt-14 text-center text-xs text-white/35">MC Advogados · Registro de marcas no INPI</footer>
      </div>
    </main>
  );
}

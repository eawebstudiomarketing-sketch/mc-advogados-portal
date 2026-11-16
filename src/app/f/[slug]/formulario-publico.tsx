"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Script from "next/script";
import { ArrowRight, Check, ChevronLeft, Loader2 } from "lucide-react";
import { proximoIndice, type Campo, type FormConfig } from "@/lib/crm/tipos";

// Formulário público (06/11/2026), no desenho do Yay! Forms: uma pergunta por
// tela, Enter avança, barra de progresso dourada no topo. Celular: a imagem
// (cartaz vertical) é o fundo da tela inteira e os botões ficam presos embaixo.
// Computador: tela dividida, imagem inteira à esquerda e a pergunta à direita.
// Imagens pelo otimizador do Next (AVIF no tamanho da tela), todas já carregadas.
// Pixels: Meta (PageView, ViewContent, Lead com o mesmo eventID do servidor) e
// Google (gtag: form_start, generate_lead e a conversão do Ads).
// Pixel próprio (16/11/2026): os 10 eventos ficam só no portal (crm_eventos):
// PageView, ViewContent, FormStart, FormFieldComplete, FormSubmit, Contact e
// WhatsAppClick saem daqui; Lead, CompleteRegistration e SubmitApplication o
// servidor grava quando o lead é salvo.

type Pixels = { meta: string | null; ga4: string | null; ads: string | null; adsLabel: string | null };
type Valor = string | string[];
type Tela = "inicio" | number | "fim";

declare global {
  interface Window {
    fbq?: (...a: unknown[]) => void;
    gtag?: (...a: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DESTAQUE = "#C6A24F"; // dourado da marca: progresso, número da pergunta, foco
const BTN = "inline-flex h-14 items-center justify-center gap-2 rounded-xl px-7 text-[17px] font-bold shadow-[0_10px_30px_-12px_rgba(0,0,0,.7)] transition-[transform,opacity] duration-150 active:scale-[.97]";
const BTN_FANTASMA =
  "inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/[.06] px-7 text-[17px] font-semibold text-white backdrop-blur-sm transition-[transform,background-color] duration-150 hover:bg-white/[.12] active:scale-[.97]";
const cookie = (n: string) => document.cookie.split("; ").find((c) => c.startsWith(`${n}=`))?.split("=").slice(1).join("=") ?? "";
const idAleatorio = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, "");

function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function invalido(c: Campo, v: Valor | undefined): string | null {
  const t = Array.isArray(v) ? v.join("") : (v ?? "").trim();
  if (!t) return "Responda para continuar."; // 10/11/2026: todas obrigatórias (sem "Pular")
  if (c.tipo === "telefone" && ![10, 11].includes(t.replace(/\D/g, "").length)) return "Confira o número com DDD.";
  if (c.tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "Confira o e-mail.";
  return null;
}

function Paragrafos({ texto, className }: { texto?: string; className?: string }) {
  if (!texto?.trim()) return null;
  return (
    <div className={className}>
      {texto.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line [&+&]:mt-3">
          {p}
        </p>
      ))}
    </div>
  );
}

export function FormularioPublico({ slug, config, pixels }: { slug: string; config: FormConfig; pixels: Pixels }) {
  const { tema, campos } = config;
  const [tela, setTela] = useState<Tela>("inicio");
  const [, setHistorico] = useState<number[]>([]);
  const [respostas, setRespostas] = useState<Record<string, Valor>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const sessao = useRef("");
  const visitante = useRef("");
  const tempos = useRef<Record<string, number>>({});
  const entrouEm = useRef(0);
  const telaAnterior = useRef<Tela>("inicio");
  const comecou = useRef(false);
  const jaFoi = useRef(new Set<string>());
  const armadilha = useRef<HTMLInputElement>(null);
  const campoRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const api = useCallback((corpo: Record<string, unknown>) => fetch(`/api/f/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessao: sessao.current, ...corpo }) }), [slug]);

  // pixel próprio: manda eventos (cada um uma vez por visita, menos os cliques no botão final)
  const evento = useCallback(
    (lista: { nome: string; pergunta?: number; campo?: string }[], beacon = false) => {
      const novos = lista.filter((e) => {
        if (e.nome === "Contact" || e.nome === "WhatsAppClick" || e.nome === "PageView") return true;
        const k = `${e.nome}:${e.campo ?? ""}`;
        if (jaFoi.current.has(k)) return false;
        jaFoi.current.add(k);
        return true;
      });
      if (!novos.length || !sessao.current) return;
      const corpo = JSON.stringify({ sessao: sessao.current, visitante: visitante.current || sessao.current, eventos: novos });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(`/api/f/${slug}`, new Blob([corpo], { type: "application/json" }));
      else fetch(`/api/f/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: corpo, keepalive: true }).catch(() => null);
    },
    [slug],
  );

  useEffect(() => {
    try {
      sessao.current = sessionStorage.getItem(`mc:f:${slug}`) ?? "";
      if (!sessao.current) {
        sessao.current = idAleatorio();
        sessionStorage.setItem(`mc:f:${slug}`, sessao.current);
      }
    } catch {
      sessao.current = idAleatorio();
    }
    // pixel próprio: o mesmo aparelho volta com o mesmo id (sabemos que é a 2ª visita)
    try {
      visitante.current = localStorage.getItem("mc:visitante") ?? "";
      if (!visitante.current) {
        visitante.current = idAleatorio();
        localStorage.setItem("mc:visitante", visitante.current);
      }
    } catch {
      visitante.current = sessao.current;
    }
    api({ passo: "abriu" }).catch(() => null);
    evento([{ nome: "PageView" }, { nome: "ViewContent" }]);
  }, [api, evento, slug]);

  const atual = typeof tela === "number" ? campos[tela] : null;
  const valor = atual ? respostas[atual.id] : undefined;
  const vazio = !valor || (Array.isArray(valor) ? !valor.length : !valor.trim());
  const ultimo = typeof tela === "number" && proximoIndice(campos, tela, valor) === -1;
  const progresso = typeof tela === "number" ? (tela + 1) / Math.max(campos.length, 1) : tela === "fim" ? 1 : 0;

  useEffect(() => {
    const t = setTimeout(() => campoRef.current?.focus({ preventScroll: true }), 350);
    return () => clearTimeout(t);
  }, [tela]);

  // pixel próprio: avisa a cada troca de tela até onde a pessoa foi e quanto tempo
  // ficou em cada pergunta (sem o que ela digitou). Ao sair da página, manda por beacon.
  const rastro = useCallback(
    (passo: number, beacon = false, saiu = false) => {
      if (!sessao.current) return;
      const q = new URLSearchParams(location.search);
      const utm = Object.fromEntries(["source", "medium", "campaign", "content", "term"].map((k) => [k, q.get(`utm_${k}`) ?? ""]).filter(([, v]) => v));
      const corpo = JSON.stringify({
        sessao: sessao.current,
        rastro: { visita: sessao.current, visitante: visitante.current || sessao.current, passo, total: campos.length, tempos: tempos.current, utm, fbclid: q.has("fbclid"), gclid: q.has("gclid"), referrer: document.referrer, saiu },
      });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(`/api/f/${slug}`, new Blob([corpo], { type: "application/json" }));
      else fetch(`/api/f/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: corpo, keepalive: true }).catch(() => null);
    },
    [campos.length, slug],
  );
  const passoDe = useCallback((t: Tela) => (typeof t === "number" ? t : t === "fim" ? campos.length : -1), [campos.length]);
  const somarTempo = useCallback(() => {
    const ant = telaAnterior.current;
    if (typeof ant === "number" && campos[ant] && entrouEm.current) tempos.current[campos[ant].id] = (tempos.current[campos[ant].id] ?? 0) + (performance.now() - entrouEm.current);
    entrouEm.current = performance.now();
  }, [campos]);

  useEffect(() => {
    somarTempo();
    telaAnterior.current = tela;
    if (tela !== "fim") rastro(passoDe(tela));
  }, [tela, rastro, passoDe, somarTempo]);

  useEffect(() => {
    const saiu = () => {
      if (document.visibilityState !== "hidden" || telaAnterior.current === "fim") return;
      somarTempo();
      rastro(passoDe(telaAnterior.current), true, true);
    };
    document.addEventListener("visibilitychange", saiu);
    return () => document.removeEventListener("visibilitychange", saiu);
  }, [rastro, passoDe, somarTempo]);

  const marcarInicio = () => {
    if (comecou.current) return;
    comecou.current = true;
    api({ passo: "comecou" }).catch(() => null);
    evento([{ nome: "FormStart" }]);
    window.gtag?.("event", "form_start", { form_id: slug });
  };

  const enviar = useCallback(
    async (todas: Record<string, Valor>) => {
      setEnviando(true);
      setErro(null);
      const q = new URLSearchParams(location.search);
      const utm = Object.fromEntries(["source", "medium", "campaign", "content", "term"].map((k) => [k, q.get(`utm_${k}`) ?? ""]).filter(([, v]) => v));
      const ga = cookie("_ga").split(".").slice(-2).join(".");
      const rastreio = Object.fromEntries(
        Object.entries({ visitante: visitante.current, fbclid: q.get("fbclid") ?? "", gclid: q.get("gclid") ?? "", fbp: cookie("_fbp"), fbc: cookie("_fbc"), ga: ga.includes(".") ? ga : "", pagina: location.href, referrer: document.referrer }).filter(([, v]) => v),
      );
      const eventId = `lead-${idAleatorio()}`;
      try {
        const r = await api({ enviar: true, respostas: todas, eventId, utm, rastreio, site: armadilha.current?.value ?? "" });
        const j = (await r.json().catch(() => ({}))) as { erro?: string };
        if (!r.ok) throw new Error(j.erro ?? "Não foi possível enviar. Tente de novo.");
        window.fbq?.("track", "Lead", { content_name: slug }, { eventID: eventId });
        window.gtag?.("event", "generate_lead", { form_id: slug, currency: "BRL", value: 0 });
        if (pixels.ads && pixels.adsLabel) window.gtag?.("event", "conversion", { send_to: `${pixels.ads}/${pixels.adsLabel}` });
        setTela("fim");
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível enviar. Tente de novo.");
      } finally {
        setEnviando(false);
      }
    },
    [api, pixels.ads, pixels.adsLabel, slug],
  );

  const avancar = useCallback(
    (novo?: Valor) => {
      if (tela === "inicio") {
        marcarInicio();
        if (campos.length) setTela(0);
        return;
      }
      if (typeof tela !== "number" || enviando) return;
      const c = campos[tela];
      const v = novo ?? respostas[c.id];
      const problema = invalido(c, v);
      if (problema) {
        setErro(problema);
        return;
      }
      marcarInicio();
      const prox = proximoIndice(campos, tela, v);
      evento([{ nome: "FormFieldComplete", pergunta: tela + 1, campo: c.id }, ...(prox === -1 ? [{ nome: "FormSubmit" }] : [])]);
      if (prox === -1) {
        void enviar(novo !== undefined ? { ...respostas, [c.id]: novo } : respostas);
        return;
      }
      setHistorico((h) => [...h, tela]);
      setErro(null);
      setTela(prox);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tela, campos, respostas, enviando, enviar],
  );

  const voltar = () => {
    setErro(null);
    setHistorico((h) => {
      const ant = h.at(-1);
      setTela(ant === undefined ? "inicio" : ant);
      return h.slice(0, -1);
    });
  };

  const escolher = (c: Campo, opcao: string) => {
    if (c.tipo === "multipla") {
      const atuais = Array.isArray(respostas[c.id]) ? (respostas[c.id] as string[]) : [];
      setRespostas({ ...respostas, [c.id]: atuais.includes(opcao) ? atuais.filter((x) => x !== opcao) : [...atuais, opcao] });
      return;
    }
    setRespostas({ ...respostas, [c.id]: opcao });
    setTimeout(() => avancar(opcao), 380);
  };

  // atalhos: Enter avança; letras escolhem a opção
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (tela === "fim") return;
      const alvo = e.target as HTMLElement;
      if (e.key === "Enter" && !(alvo.tagName === "TEXTAREA" && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        avancar();
        return;
      }
      if (atual && opcoesDe(atual).length && alvo.tagName !== "INPUT" && alvo.tagName !== "TEXTAREA" && /^[a-z]$/i.test(e.key)) {
        const i = LETRAS.indexOf(e.key.toUpperCase());
        const op = opcoesDe(atual)[i];
        if (op) escolher(atual, op);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const imagem = tela === "inicio" ? config.boasVindas.imagem : tela === "fim" ? config.final.imagem : atual?.imagem;
  const imagens = useMemo(() => [...new Set([config.boasVindas.imagem, ...campos.map((c) => c.imagem), config.final.imagem].filter(Boolean) as string[])], [config, campos]);
  const estilo = useMemo(() => ({ "--f-fundo": tema.fundo, "--f-texto": tema.texto, "--f-resp": tema.resposta, "--f-btn": tema.botaoFundo, "--f-btn-t": tema.botaoTexto, "--f-destaque": DESTAQUE }) as React.CSSProperties, [tema]);
  const numero = typeof tela === "number" ? tela + 1 : 0;
  const centro = tela === "inicio" || tela === "fim";

  const botoes = (
    <>
      {tela === "inicio" && (
        <button type="button" onClick={() => avancar()} className={`${BTN} flex-1 lg:flex-none`} style={{ background: "var(--f-btn)", color: "var(--f-btn-t)" }}>
          {config.boasVindas.botao || "Começar"}
          <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      )}
      {typeof tela === "number" && (
        <>
          <button type="button" onClick={voltar} aria-label="Voltar" className={`${BTN_FANTASMA} w-14 shrink-0 !px-0`}>
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
          {(
            <button
              type="button"
              onClick={() => avancar()}
              disabled={enviando}
              aria-disabled={vazio}
              className={`${BTN} flex-1 disabled:opacity-70 lg:flex-none ${vazio ? "opacity-45" : ""}`}
              style={{ background: "var(--f-btn)", color: "var(--f-btn-t)" }}
            >
              {enviando ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Enviando…
                </>
              ) : ultimo ? (
                <>
                  Enviar respostas <Check className="h-5 w-5" aria-hidden />
                </>
              ) : (
                <>
                  OK <ArrowRight className="h-5 w-5" aria-hidden />
                </>
              )}
            </button>
          )}
        </>
      )}
      {tela === "fim" && config.final.botao && config.final.link && (
        <a href={config.final.link} target="_blank" rel="noopener noreferrer" onClick={() => {
            window.fbq?.("track", "Contact");
            evento([{ nome: "Contact" }, ...(/wa\.me|whatsapp\.com/i.test(config.final.link ?? "") ? [{ nome: "WhatsAppClick" }] : [])], true);
          }} className={`${BTN} flex-1 lg:flex-none`} style={{ background: "var(--f-btn)", color: "var(--f-btn-t)" }}>
          {config.final.botao}
          <ArrowRight className="h-5 w-5" aria-hidden />
        </a>
      )}
    </>
  );

  return (
    <main className="relative min-h-dvh font-[family-name:var(--font-lato)] antialiased lg:grid lg:grid-cols-2" style={{ background: "var(--f-fundo)", color: "var(--f-texto)", ...estilo }}>
      <Pixels pixels={pixels} />
      <style>{`
        @keyframes f-entra { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        .f-entra > * { animation: f-entra .5s cubic-bezier(.22,1,.36,1) both }
        .f-entra > *:nth-child(2) { animation-delay: .05s } .f-entra > *:nth-child(3) { animation-delay: .1s } .f-entra > *:nth-child(n+4) { animation-delay: .15s }
        @media (prefers-reduced-motion: reduce) { .f-entra > * { animation: none } }
      `}</style>

      {/* progresso */}
      <div className="fixed inset-x-0 top-0 z-30 h-[3px] bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={campos.length} aria-valuenow={numero} aria-label="Progresso">
        <div className="h-full transition-[width] duration-500 ease-out" style={{ width: `${progresso * 100}%`, background: "var(--f-destaque)" }} />
      </div>

      {/* imagens: no celular são o fundo da tela inteira; no computador, a metade esquerda (inteira, sem cortar).
          Todas ficam carregadas por baixo e só trocam a transparência (nada aparece atrasado). */}
      <div className="pointer-events-none fixed inset-0 lg:sticky lg:top-0 lg:h-dvh" aria-hidden>
        {imagens.map((u, i) => (
          <Image
            key={u}
            src={u}
            alt=""
            fill
            priority={i === 0}
            loading={i === 0 ? undefined : "eager"}
            quality={72}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className={`object-cover object-top transition-opacity duration-700 ease-out lg:object-contain lg:object-center ${u === imagem ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        {/* no celular, escurece embaixo para o texto ler bem por cima da imagem */}
        <div
          className="absolute inset-0 lg:hidden"
          style={{ background: "linear-gradient(to bottom, transparent 26%, color-mix(in srgb, var(--f-fundo) 55%, transparent) 42%, color-mix(in srgb, var(--f-fundo) 90%, transparent) 62%, var(--f-fundo) 100%)" }}
        />
      </div>

      <input ref={armadilha} name="site" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      <section
        className={`relative z-10 flex min-h-dvh flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-10 lg:justify-center lg:px-16 lg:py-20 xl:px-24 ${imagem ? "pt-[40dvh] lg:pt-20" : "pt-[18dvh] lg:pt-20"} ${centro ? "text-center lg:text-left" : ""}`}
      >
        <div key={String(tela)} className="f-entra mx-auto w-full max-w-[34rem] lg:mx-0">
          {tela === "inicio" && (
            <>
              {config.boasVindas.titulo && <h1 className="text-balance text-[30px] font-bold leading-[1.15] tracking-[-0.01em] lg:text-[42px]">{config.boasVindas.titulo}</h1>}
              <Paragrafos texto={config.boasVindas.descricao} className={`text-pretty text-[16px] leading-relaxed opacity-80 lg:text-[18px] ${config.boasVindas.titulo ? "mt-4" : ""}`} />
              <p className="mt-5 text-[13px] opacity-55">
                {campos.length} perguntas rápidas · cerca de {Math.max(1, Math.round(campos.length * 0.25))} min
              </p>
            </>
          )}

          {atual && (
            <>
              <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--f-destaque)" }}>
                {numero} de {campos.length}
              </p>
              <label htmlFor={`f-${atual.id}`} className="block text-balance text-[24px] font-bold leading-[1.25] lg:text-[32px]">
                {atual.titulo}
              </label>
              <Paragrafos texto={atual.descricao} className="mt-2.5 text-pretty text-[16px] leading-relaxed opacity-70 lg:text-[17px]" />
              <div className="mt-8">
                <Entrada
                  campo={atual}
                  valor={valor}
                  inputRef={campoRef}
                  ultimo={ultimo}
                  onMudar={(v) => {
                    setErro(null);
                    marcarInicio();
                    setRespostas({ ...respostas, [atual.id]: v });
                  }}
                  onEscolher={(op) => escolher(atual, op)}
                />
              </div>
              <p role="alert" aria-live="polite" className={`mt-4 min-h-6 text-[14px] font-semibold text-[#FF8A7A] transition-opacity ${erro ? "opacity-100" : "opacity-0"}`}>
                {erro}
              </p>
            </>
          )}

          {tela === "fim" && (
            <>
              <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full lg:mx-0" style={{ background: "color-mix(in srgb, var(--f-destaque) 18%, transparent)", color: "var(--f-destaque)" }}>
                <Check className="h-7 w-7" aria-hidden />
              </span>
              <h1 className="text-balance text-[30px] font-bold leading-[1.15] lg:text-[42px]">{config.final.titulo}</h1>
              <Paragrafos texto={config.final.descricao} className="mt-4 text-pretty text-[16px] leading-relaxed opacity-80 lg:text-[18px]" />
            </>
          )}

          {/* computador: botões logo abaixo do conteúdo */}
          <div className="mt-10 hidden items-center gap-3 lg:flex">{botoes}</div>
          {typeof tela === "number" && <p className="mt-3 hidden text-[13px] opacity-50 lg:block">ou aperte Enter ↵</p>}
        </div>
      </section>

      {/* celular: botões presos embaixo */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:hidden" style={{ background: "linear-gradient(to top, var(--f-fundo) 60%, transparent)" }}>
        {botoes}
      </div>
    </main>
  );
}

const opcoesDe = (c: Campo) => (c.tipo === "sim_nao" ? ["Sim", "Não"] : c.tipo === "escolha" || c.tipo === "multipla" ? (c.opcoes ?? []) : []);

const LINHA =
  "w-full rounded-none border-0 border-b-2 bg-transparent pb-3 text-[22px] leading-tight outline-none transition-colors duration-200 placeholder:text-white/35 focus:border-[var(--f-destaque)] lg:text-[26px]";

function Entrada({
  campo,
  valor,
  inputRef,
  ultimo,
  onMudar,
  onEscolher,
}: {
  campo: Campo;
  valor: Valor | undefined;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  ultimo: boolean;
  onMudar: (v: Valor) => void;
  onEscolher: (op: string) => void;
}) {
  const corLinha = { borderColor: "color-mix(in srgb, var(--f-resp) 45%, transparent)", color: "var(--f-texto)", caretColor: "var(--f-destaque)" };
  const ops = opcoesDe(campo);
  if (ops.length) {
    const marcados = Array.isArray(valor) ? valor : valor ? [valor] : [];
    return (
      <div className={`grid gap-2.5 ${campo.tipo === "sim_nao" ? "grid-cols-2" : ""}`} role={campo.tipo === "multipla" ? "group" : "radiogroup"} aria-labelledby={`f-${campo.id}`}>
        {ops.map((op, i) => {
          const on = marcados.includes(op);
          return (
            <button
              key={op}
              type="button"
              role={campo.tipo === "multipla" ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => onEscolher(op)}
              className="group flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[17px] font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[.98]"
              style={{
                borderColor: on ? "var(--f-destaque)" : "rgba(255,255,255,.2)",
                background: on ? "color-mix(in srgb, var(--f-destaque) 16%, transparent)" : "rgba(255,255,255,.05)",
              }}
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border text-[12px] font-bold transition-colors"
                style={{ borderColor: on ? "var(--f-destaque)" : "rgba(255,255,255,.3)", background: on ? "var(--f-destaque)" : "transparent", color: on ? "#0b1324" : "inherit" }}
              >
                {on && campo.tipo === "multipla" ? <Check className="h-4 w-4" aria-hidden /> : campo.tipo === "sim_nao" ? op[0] : LETRAS[i]}
              </span>
              {op}
            </button>
          );
        })}
        {campo.tipo === "multipla" && <p className="text-[13px] opacity-60">Pode marcar mais de uma.</p>}
      </div>
    );
  }
  const v = typeof valor === "string" ? valor : "";
  const tecla = ultimo ? "send" : "next";
  if (campo.tipo === "texto_longo")
    return (
      <>
        <textarea
          id={`f-${campo.id}`}
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={3}
          value={v}
          enterKeyHint={tecla}
          onChange={(e) => onMudar(e.target.value)}
          placeholder="Escreva aqui…"
          className={`${LINHA} resize-none`}
          style={corLinha}
        />
        <p className="mt-2 hidden text-[12px] opacity-45 lg:block">Shift + Enter para pular linha</p>
      </>
    );
  if (campo.tipo === "telefone")
    return (
      <div className="flex items-end gap-3">
        <span className="shrink-0 border-b-2 pb-3 text-[20px] lg:text-[24px]" style={corLinha}>
          🇧🇷 +55
        </span>
        <input
          id={`f-${campo.id}`}
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint={tecla}
          value={v}
          onChange={(e) => onMudar(mascaraTelefone(e.target.value))}
          placeholder="(73) 99999-9999"
          className={LINHA}
          style={corLinha}
        />
      </div>
    );
  return (
    <input
      id={`f-${campo.id}`}
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={campo.tipo === "email" ? "email" : campo.tipo === "numero" ? "number" : "text"}
      inputMode={campo.tipo === "numero" ? "decimal" : campo.tipo === "email" ? "email" : undefined}
      autoComplete={campo.mapear === "nome" ? "name" : campo.mapear === "email" || campo.tipo === "email" ? "email" : campo.mapear === "empresa" ? "organization" : "off"}
      autoCapitalize={campo.tipo === "email" ? "none" : "sentences"}
      enterKeyHint={tecla}
      value={v}
      onChange={(e) => onMudar(e.target.value)}
      placeholder="Escreva aqui…"
      className={LINHA}
      style={corLinha}
    />
  );
}

function Pixels({ pixels }: { pixels: Pixels }) {
  const tags = [pixels.ga4, pixels.ads].filter(Boolean) as string[];
  return (
    <>
      {pixels.meta && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixels.meta)});fbq('track','PageView');fbq('track','ViewContent');`}
        </Script>
      )}
      {tags.length > 0 && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tags[0])}`} strategy="afterInteractive" />
          <Script id="gtag" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());${tags.map((t) => `gtag('config',${JSON.stringify(t)});`).join("")}`}
          </Script>
        </>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { ChevronLeft } from "lucide-react";
import { proximoIndice, type Campo, type FormConfig } from "@/lib/crm/tipos";

// Formulário público (06/11/2026), no desenho do Yay! Forms: fundo escuro,
// imagem no alto que se funde com o fundo, uma pergunta por tela, botão branco
// embaixo ("Pular" quando vazio), barra de progresso no topo, Enter avança.
// Pixels: Meta (PageView, ViewContent, Lead com o mesmo eventID do servidor) e
// Google (gtag: form_start, generate_lead e a conversão do Ads).

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
  if (!t) return c.obrigatorio ? "Responda para continuar." : null;
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
  const comecou = useRef(false);
  const armadilha = useRef<HTMLInputElement>(null);
  const campoRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const api = useCallback((corpo: Record<string, unknown>) => fetch(`/api/f/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessao: sessao.current, ...corpo }) }), [slug]);

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
    api({ passo: "abriu" }).catch(() => null);
    // baixa as imagens das próximas telas já na abertura (não aparecem atrasadas)
    for (const u of [...config.campos.map((c) => c.imagem), config.final.imagem]) if (u) new Image().src = u;
  }, [api, slug, config]);

  const atual = typeof tela === "number" ? campos[tela] : null;
  const valor = atual ? respostas[atual.id] : undefined;
  const vazio = !valor || (Array.isArray(valor) ? !valor.length : !valor.trim());
  const ultimo = typeof tela === "number" && proximoIndice(campos, tela, valor) === -1;
  const progresso = typeof tela === "number" ? (tela + 1) / Math.max(campos.length, 1) : tela === "fim" ? 1 : 0;

  useEffect(() => {
    const t = setTimeout(() => campoRef.current?.focus({ preventScroll: true }), 350);
    return () => clearTimeout(t);
  }, [tela]);

  const marcarInicio = () => {
    if (comecou.current) return;
    comecou.current = true;
    api({ passo: "comecou" }).catch(() => null);
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
        Object.entries({ fbclid: q.get("fbclid") ?? "", gclid: q.get("gclid") ?? "", fbp: cookie("_fbp"), fbc: cookie("_fbc"), ga: ga.includes(".") ? ga : "", pagina: location.href, referrer: document.referrer }).filter(([, v]) => v),
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
  const estilo = useMemo(() => ({ "--f-fundo": tema.fundo, "--f-texto": tema.texto, "--f-resp": tema.resposta, "--f-btn": tema.botaoFundo, "--f-btn-t": tema.botaoTexto }) as React.CSSProperties, [tema]);

  return (
    <main className="min-h-dvh font-[family-name:var(--font-lato)]" style={{ background: tema.pagina, ...estilo }}>
      <Pixels pixels={pixels} />
      <style>{`
        @keyframes f-entra { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
        .f-entra { animation: f-entra .45s cubic-bezier(.22,1,.36,1) both }
        @media (prefers-reduced-motion: reduce) { .f-entra { animation: none } }
      `}</style>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[560px] flex-col overflow-hidden" style={{ background: "var(--f-fundo)", color: "var(--f-texto)" }}>
        {/* progresso */}
        <div className="absolute inset-x-0 top-0 z-20 h-1 bg-black/60" aria-hidden>
          <div className="h-full bg-white transition-[width] duration-500 ease-out" style={{ width: `${progresso * 100}%` }} />
        </div>

        {imagem && (
          <div key={imagem} className="pointer-events-none absolute inset-x-0 top-0 h-[64dvh] animate-[f-entra_.6s_ease-out_both] motion-reduce:animate-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagem} alt="" className="h-full w-full object-cover object-top" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 45%, var(--f-fundo) 98%)" }} />
          </div>
        )}

        <input ref={armadilha} name="site" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

        <div key={String(tela)} className={`f-entra relative z-10 flex flex-1 flex-col px-8 pb-32 ${imagem ? "pt-[40dvh]" : "pt-[22dvh]"}`}>
          {tela === "inicio" && (
            <div className="mt-auto text-center sm:mt-6">
              <h1 className="text-[28px] leading-tight">{config.boasVindas.titulo}</h1>
              <Paragrafos texto={config.boasVindas.descricao} className="mt-4 text-[15px] leading-relaxed" />
            </div>
          )}

          {atual && (
            <div className="mt-6">
              <label htmlFor={`f-${atual.id}`} className="block text-[20px] leading-snug">
                {atual.titulo}
                {atual.obrigatorio && <span aria-hidden> *</span>}
              </label>
              <Paragrafos texto={atual.descricao} className="mt-2 text-[15px] leading-relaxed opacity-85" />
              <div className="mt-7">
                <Entrada
                  campo={atual}
                  valor={valor}
                  inputRef={campoRef}
                  onMudar={(v) => {
                    setErro(null);
                    marcarInicio();
                    setRespostas({ ...respostas, [atual.id]: v });
                  }}
                  onEscolher={(op) => escolher(atual, op)}
                />
              </div>
              {erro && (
                <p role="alert" className="mt-4 inline-block rounded bg-red-600/90 px-2.5 py-1 text-sm text-white">
                  {erro}
                </p>
              )}
            </div>
          )}

          {tela === "fim" && (
            <div className="mt-auto text-center sm:mt-6">
              <h1 className="text-[28px] leading-tight">{config.final.titulo}</h1>
              <Paragrafos texto={config.final.descricao} className="mt-4 text-[15px] leading-relaxed" />
            </div>
          )}
        </div>

        {/* botões embaixo */}
        <div className="absolute inset-x-4 bottom-5 z-20 flex gap-3">
          {tela === "inicio" && (
            <button type="button" onClick={() => avancar()} className="h-12 flex-1 rounded text-lg transition-transform active:scale-[.98]" style={{ background: "var(--f-btn)", color: "var(--f-btn-t)" }}>
              {config.boasVindas.botao || "Começar"}
            </button>
          )}
          {typeof tela === "number" && (
            <>
              <button type="button" onClick={voltar} aria-label="Voltar" className="grid h-12 w-12 shrink-0 place-items-center rounded transition-transform active:scale-[.96]" style={{ background: "var(--f-btn)", color: "var(--f-btn-t)" }}>
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => avancar()}
                disabled={enviando}
                className="h-12 flex-1 rounded text-lg transition-[transform,background-color] active:scale-[.98] disabled:opacity-70"
                style={vazio && !atual?.obrigatorio && !ultimo ? { background: "#C0C3C7", color: "#111" } : { background: "var(--f-btn)", color: "var(--f-btn-t)" }}
              >
                {enviando ? "Enviando…" : ultimo ? "Enviar" : vazio && !atual?.obrigatorio ? "Pular" : "OK"}
              </button>
            </>
          )}
          {tela === "fim" && config.final.botao && config.final.link && (
            <a href={config.final.link} target="_blank" rel="noopener noreferrer" onClick={() => window.fbq?.("track", "Contact")} className="grid h-12 flex-1 place-items-center rounded text-lg font-bold transition-transform active:scale-[.98]" style={{ background: "var(--f-btn)", color: "var(--f-btn-t)" }}>
              {config.final.botao}
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

const opcoesDe = (c: Campo) => (c.tipo === "sim_nao" ? ["Sim", "Não"] : c.tipo === "escolha" || c.tipo === "multipla" ? (c.opcoes ?? []) : []);

function Entrada({
  campo,
  valor,
  inputRef,
  onMudar,
  onEscolher,
}: {
  campo: Campo;
  valor: Valor | undefined;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onMudar: (v: Valor) => void;
  onEscolher: (op: string) => void;
}) {
  const linha = "w-full border-0 border-b bg-transparent pb-2 text-[20px] outline-none placeholder:opacity-50 focus:border-b-2";
  const corLinha = { borderColor: "var(--f-resp)", color: "var(--f-texto)" };
  const ops = opcoesDe(campo);
  if (ops.length) {
    const marcados = Array.isArray(valor) ? valor : valor ? [valor] : [];
    return (
      <div className="flex flex-col gap-2.5" role={campo.tipo === "multipla" ? "group" : "radiogroup"} aria-labelledby={`f-${campo.id}`}>
        {ops.map((op, i) => {
          const on = marcados.includes(op);
          return (
            <button
              key={op}
              type="button"
              role={campo.tipo === "multipla" ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => onEscolher(op)}
              className="flex min-h-12 w-full items-center gap-3 rounded border px-3 py-2 text-left text-[17px] transition-colors"
              style={{ borderColor: on ? "var(--f-texto)" : "color-mix(in srgb, var(--f-resp) 55%, transparent)", background: on ? "color-mix(in srgb, var(--f-texto) 18%, transparent)" : "color-mix(in srgb, var(--f-texto) 6%, transparent)" }}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border text-xs font-bold" style={{ borderColor: "var(--f-resp)", background: on ? "var(--f-texto)" : "transparent", color: on ? "var(--f-fundo)" : "var(--f-texto)" }}>
                {campo.tipo === "sim_nao" ? op[0] : LETRAS[i]}
              </span>
              {op}
            </button>
          );
        })}
        {campo.tipo === "multipla" && <p className="text-xs opacity-70">Pode marcar mais de uma.</p>}
      </div>
    );
  }
  const v = typeof valor === "string" ? valor : "";
  if (campo.tipo === "texto_longo")
    return (
      <textarea
        id={`f-${campo.id}`}
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        rows={3}
        value={v}
        onChange={(e) => onMudar(e.target.value)}
        placeholder="Digite sua resposta aqui..."
        className={`${linha} resize-none`}
        style={corLinha}
      />
    );
  if (campo.tipo === "telefone")
    return (
      <div className="flex items-end gap-2">
        <span className="shrink-0 border-b pb-2 text-[17px]" style={corLinha}>
          <span className="mr-1 text-xs">BR</span>+55
        </span>
        <input
          id={`f-${campo.id}`}
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={v}
          onChange={(e) => onMudar(mascaraTelefone(e.target.value))}
          placeholder="(11) 98765-4321"
          className={linha}
          style={corLinha}
        />
      </div>
    );
  return (
    <input
      id={`f-${campo.id}`}
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={campo.tipo === "email" ? "email" : campo.tipo === "numero" ? "number" : "text"}
      inputMode={campo.tipo === "numero" ? "decimal" : undefined}
      autoComplete={campo.mapear === "nome" ? "name" : campo.mapear === "email" || campo.tipo === "email" ? "email" : campo.mapear === "empresa" ? "organization" : "off"}
      value={v}
      onChange={(e) => onMudar(e.target.value)}
      placeholder="Digite sua resposta aqui..."
      className={linha}
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

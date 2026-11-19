"use client";

// Iscas (18/11/2026): peças comuns das ferramentas grátis (/ferramentas/*):
// moldura com a marca, título, caixa de contato que vira lead no CRM (form
// isca-<nome>), botão do WhatsApp e o pixel próprio (visita e eventos).
import { useCallback, useEffect, useRef, useState } from "react";

export const OURO = "#c9a557";
export const ZAP = "5573998469554";
export const CAMPO =
  "w-full rounded-2xl border-2 border-white/12 bg-white/[0.06] px-5 text-[17px] text-white placeholder:text-white/40 transition focus:border-[#c9a557] focus:bg-white/[0.09] focus:outline-none";

const idAleatorio = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, "");
const utmDaUrl = () => {
  const q = new URLSearchParams(location.search);
  return Object.fromEntries(["source", "medium", "campaign", "content", "term"].map((k) => [k, q.get(`utm_${k}`) ?? ""]).filter(([, v]) => v));
};

export function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Pixel próprio + envio do lead da isca (mesma rota dos formulários do CRM). */
export function useIsca(slug: string, totalPassos = 2) {
  const sessao = useRef("");
  const visitante = useRef("");
  const armadilha = useRef<HTMLInputElement>(null);

  const api = useCallback(
    (corpo: Record<string, unknown>, beacon = false) => {
      const txt = JSON.stringify({ sessao: sessao.current, ...corpo });
      if (beacon && navigator.sendBeacon) return void navigator.sendBeacon(`/api/f/${slug}`, new Blob([txt], { type: "application/json" }));
      return void fetch(`/api/f/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: txt, keepalive: true }).catch(() => null);
    },
    [slug],
  );
  const evento = useCallback(
    (nomes: string[], beacon = false) => api({ visitante: visitante.current || sessao.current, eventos: nomes.map((n) => ({ nome: n })) }, beacon),
    [api],
  );

  useEffect(() => {
    try {
      sessao.current = sessionStorage.getItem(`mc:f:${slug}`) ?? "";
      if (!sessao.current) sessionStorage.setItem(`mc:f:${slug}`, (sessao.current = idAleatorio()));
      visitante.current = localStorage.getItem("mc:visitante") ?? "";
      if (!visitante.current) localStorage.setItem("mc:visitante", (visitante.current = idAleatorio()));
    } catch {
      sessao.current ||= idAleatorio();
      visitante.current = sessao.current;
    }
    const q = new URLSearchParams(location.search);
    api({ passo: "abriu" });
    api({ rastro: { visita: sessao.current, visitante: visitante.current, passo: -1, total: totalPassos, utm: utmDaUrl(), fbclid: q.has("fbclid"), gclid: q.has("gclid"), referrer: document.referrer } });
    evento(["PageView", "ViewContent"]);
  }, [api, evento, slug, totalPassos]);

  const comecou = useCallback(() => {
    api({ passo: "comecou" });
    evento(["FormStart"]);
  }, [api, evento]);

  /** Cria o lead. respostas: as chaves são os ids dos campos do formulário isca-<nome>. */
  const enviarLead = useCallback(
    async (respostas: Record<string, string>): Promise<string | null> => {
      evento(["FormSubmit"]);
      try {
        const r = await fetch(`/api/f/${slug}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessao: sessao.current,
            enviar: true,
            respostas,
            eventId: `lead-${idAleatorio()}`,
            utm: utmDaUrl(),
            rastreio: { visitante: visitante.current, pagina: location.href, referrer: document.referrer },
            site: armadilha.current?.value ?? "",
          }),
        });
        const j = await r.json().catch(() => ({}));
        return r.ok ? null : (j.erro ?? "Não foi possível enviar agora. Tente de novo.");
      } catch {
        return "Sem conexão. Tente de novo.";
      }
    },
    [evento, slug],
  );

  return { api, evento, comecou, enviarLead, armadilha };
}

export function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#07111f] font-[family-name:var(--font-lato)] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_55%_at_50%_0%,rgba(201,165,87,0.16),transparent_70%)]" aria-hidden />
      <div className="relative mx-auto w-full max-w-lg px-4 pt-7 pb-16 sm:pt-12">
        <header className="mb-10 flex items-center justify-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo_mc.jpg" alt="" className="h-8 w-8 rounded-full object-cover" />
          <span className="text-[13px] font-bold tracking-[0.28em] text-white/80">MC ADVOGADOS</span>
        </header>
        {children}
        <footer className="mt-14 text-center text-xs text-white/35">© MC Advogados</footer>
      </div>
    </main>
  );
}

export function Titulo({ antes, destaque, depois = "", sub }: { antes: React.ReactNode; destaque: string; depois?: string; sub: string }) {
  return (
    <>
      <h1 className="text-center font-[family-name:var(--font-playfair)] text-[2.6rem] leading-[1.04] font-extrabold tracking-tight sm:text-[3.3rem]">
        {antes} <em style={{ color: OURO }}>{destaque}</em>
        {depois}
      </h1>
      <p className="mx-auto mt-4 max-w-sm text-center text-[17px] leading-snug text-white/70">{sub}</p>
    </>
  );
}

export function BotaoOuro({ children, disabled, onClick, type = "submit" }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: "submit" | "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-16 w-full rounded-2xl text-lg font-black text-[#07111f] shadow-[0_10px_30px_-10px_rgba(201,165,87,0.7)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
      style={{ background: OURO }}
    >
      {children}
    </button>
  );
}

/** Nome + WhatsApp → lead. Depois de enviar mostra o "Pronto". */
export function CaixaLead({
  titulo,
  texto,
  botao,
  pronto,
  onEnviar,
}: {
  titulo: string;
  texto: string;
  botao: string;
  pronto: (primeiroNome: string) => string;
  onEnviar: (nome: string, telefone: string) => Promise<string | null>;
}) {
  const [nome, setNome] = useState("");
  const [fone, setFone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nome.trim().length < 2) return setErro("Digite seu nome.");
    if (fone.replace(/\D/g, "").length < 10) return setErro("Digite seu WhatsApp com DDD.");
    setEnviando(true);
    const falha = await onEnviar(nome.trim(), fone);
    setEnviando(false);
    if (falha) return setErro(falha);
    setEnviado(true);
  }

  if (enviado)
    return (
      <div className="mt-5 rounded-[28px] bg-[#41c28a]/12 p-6 text-center">
        <p className="text-4xl" aria-hidden>
          ✓
        </p>
        <p className="mt-1 font-[family-name:var(--font-playfair)] text-[1.6rem] font-extrabold">Pronto, {nome.trim().split(" ")[0]}!</p>
        <p className="mt-1 text-[15px] leading-snug text-white/75">{pronto(nome.trim().split(" ")[0])}</p>
      </div>
    );
  return (
    <form onSubmit={enviar} className="mt-5 rounded-[28px] border border-[#c9a557]/45 bg-[#c9a557]/[0.08] p-5">
      <h3 className="font-[family-name:var(--font-playfair)] text-[1.6rem] leading-tight font-extrabold">{titulo}</h3>
      <p className="mt-2 text-[15px] leading-snug text-white/75">{texto}</p>
      <div className="mt-4 space-y-3">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" autoComplete="name" className={`${CAMPO} h-14`} />
        <input value={fone} onChange={(e) => setFone(mascaraTelefone(e.target.value))} placeholder="Seu WhatsApp com DDD" inputMode="tel" autoComplete="tel" className={`${CAMPO} h-14`} />
        <button
          type="submit"
          disabled={enviando}
          className="h-16 w-full rounded-2xl bg-white text-lg font-black text-[#07111f] transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-70"
        >
          {enviando ? "Enviando…" : botao}
        </button>
        {erro && <p className="text-center text-sm text-[#ff8a80]">{erro}</p>}
      </div>
    </form>
  );
}

export function BotaoZap({ mensagem, onClick, texto = "Falar agora no WhatsApp" }: { mensagem: string; onClick: () => void; texto?: string }) {
  return (
    <a
      href={`https://wa.me/${ZAP}?text=${encodeURIComponent(mensagem)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25d366] text-[16px] font-black text-[#07111f] transition hover:brightness-105 active:scale-[0.98]"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1 2.7 11.5 11.5 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.6-.3Z" />
      </svg>
      {texto}
    </a>
  );
}

export const COR_NIVEL = { baixo: "#41c28a", medio: "#f0b23e", alto: "#ef5a4f" } as const;
const ANGULO = { baixo: -58, medio: 0, alto: 58 } as const;

/** Medidor (semicírculo verde → amarelo → vermelho) com o ponteiro no nível. Para cartão branco. */
export function Medidor({ nivel }: { nivel: "baixo" | "medio" | "alto" }) {
  const [ang, setAng] = useState(-90);
  useEffect(() => {
    const t = setTimeout(() => setAng(ANGULO[nivel]), 80);
    return () => clearTimeout(t);
  }, [nivel]);
  const arco = (de: number, ate: number) => {
    const p = (a: number) => [100 + 80 * Math.cos(((a - 180) * Math.PI) / 180), 100 + 80 * Math.sin(((a - 180) * Math.PI) / 180)];
    const [x1, y1] = p(de);
    const [x2, y2] = p(ate);
    return `M ${x1} ${y1} A 80 80 0 0 1 ${x2} ${y2}`;
  };
  return (
    <svg viewBox="0 0 200 118" className="mx-auto w-full max-w-[260px]" aria-hidden>
      <path d={arco(2, 58)} stroke={COR_NIVEL.baixo} strokeWidth="16" fill="none" strokeLinecap="round" opacity={nivel === "baixo" ? 1 : 0.28} />
      <path d={arco(62, 118)} stroke={COR_NIVEL.medio} strokeWidth="16" fill="none" strokeLinecap="round" opacity={nivel === "medio" ? 1 : 0.28} />
      <path d={arco(122, 178)} stroke={COR_NIVEL.alto} strokeWidth="16" fill="none" strokeLinecap="round" opacity={nivel === "alto" ? 1 : 0.28} />
      <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: "100px 100px", transition: "transform 1.1s cubic-bezier(.22,1,.36,1)" }}>
        <line x1="100" y1="100" x2="100" y2="34" stroke="#0b1626" strokeWidth="5" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="10" fill="#0b1626" />
      <circle cx="100" cy="100" r="4" fill="#fff" />
    </svg>
  );
}

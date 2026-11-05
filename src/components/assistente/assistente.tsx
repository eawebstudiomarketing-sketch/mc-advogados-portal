"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, X, RotateCcw, CornerRightDown, ArrowUp, Check, AlertTriangle, Trash2, Send, Wrench, Paperclip, FileText, Loader2, Bell } from "lucide-react";
import { createClient as criarSupabase } from "@/lib/supabase/client";
import { AudioAnswer } from "@/components/ui/audio-answer";
import { ROTULO_FERRAMENTA, FERRAMENTAS_DE_ESCRITA } from "@/lib/assistente/labels";
import { AlcasRedimensionar, useJanelaMovel } from "./janela-movel";

type Part = {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: { name?: string; response?: { ok?: boolean; erro?: string; cancelado?: boolean } };
};
type Content = { role?: string; parts?: Part[] };
type Pendente = { tipo?: "exclusao" | "envio" | "alteracao"; itens: { name: string; label: string; resumo: string }[] };
type Anexo = { caminho: string; nome: string; enviando?: boolean; previa?: string };

const RE_ANEXO = /\[Anexo: (.+?) \(anexo=[^)]+\)\]/g;

// Conversa guardada por CONTA (05/11/2026): antes a chave era a mesma para
// todos, e quem entrava com outra conta no mesmo navegador via a conversa da
// pessoa anterior. A chave antiga é apagada.
const chaveDe = (usuarioId: string) => `mc:assistente:${usuarioId}`;

// ---------- markdown mínimo (negrito, links, listas, quebras) ----------
function linha(texto: string, key: string, onLink: (href: string) => void) {
  const nodes: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) nodes.push(texto.slice(ultimo, m.index));
    if (m[1]) {
      const href = m[2];
      nodes.push(
        href.startsWith("/") ? (
          <Link key={`${key}-${i++}`} href={href} onClick={() => onLink(href)} className="font-medium text-navy-3 underline underline-offset-2">
            {m[1]}
          </Link>
        ) : (
          <a key={`${key}-${i++}`} href={href} target="_blank" rel="noreferrer" className="font-medium text-navy-3 underline underline-offset-2">
            {m[1]}
          </a>
        )
      );
    } else nodes.push(<strong key={`${key}-${i++}`} className="font-semibold">{m[3]}</strong>);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) nodes.push(texto.slice(ultimo));
  return nodes;
}

function Markdown({ texto, onLink }: { texto: string; onLink: (href: string) => void }) {
  const blocos = texto.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocos.map((b, bi) => {
        const linhas = b.split("\n");
        if (linhas.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          return (
            <ul key={bi} className="space-y-1">
              {linhas.map((l, li) => (
                <li key={li} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />
                  <span>{linha(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${bi}-${li}`, onLink)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {linhas.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {linha(l, `${bi}-${li}`, onLink)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function lerSalvo(usuarioId: string): Content[] {
  try {
    sessionStorage.removeItem("mc:assistente");
    const s = sessionStorage.getItem(chaveDe(usuarioId));
    return s ? (JSON.parse(s) as Content[]) : [];
  } catch {
    return [];
  }
}

// Balão do assistente: conversa com o Gemini, que executa ações no portal.
export function Assistente({
  nome,
  usuarioId,
  modo = "flutuante",
  publicacoes = null,
}: {
  nome: string;
  /** id da conta: cada uma tem a própria conversa */
  usuarioId: string;
  /** flutuante = balão (Ctrl+J); pagina = app do celular (/assistente); tela = Ferramentas › IA, dentro do portal */
  modo?: "flutuante" | "pagina" | "tela";
  /** App instalável (admin): atalho para as Publicações com o número de não tratadas. */
  publicacoes?: number | null;
}) {
  const tela = modo === "tela";
  // "pagina" = sempre aberto e em tamanho grande (app do celular e tela IA)
  const pagina = modo === "pagina" || tela;
  const router = useRouter();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(pagina);
  const janela = useJanelaMovel(aberto && !pagina);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [history, setHistory] = useState<Content[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [montado, setMontado] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMontado(true); // eslint-disable-line react-hooks/set-state-in-effect -- só para o portal no cliente
    setHistory(lerSalvo(usuarioId));
  }, [usuarioId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(chaveDe(usuarioId), JSON.stringify(history.slice(-60)));
    } catch {}
  }, [history, usuarioId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, pensando, pendente, aberto]);

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (pagina) inputRef.current?.focus();
        else setAberto((a) => !a);
      }
      if (e.key === "Escape" && !pagina) setAberto(false);
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, [pagina]);

  useEffect(() => {
    if (aberto) setTimeout(() => inputRef.current?.focus(), 50);
  }, [aberto]);

  async function chamar(payload: { mensagem?: string; confirmacao?: { aprovado: boolean }; anexos?: Anexo[] }, base: Content[]) {
    setPensando(true);
    setPendente(null);
    try {
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: base, pathname, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.history) setHistory(data.history);
      if (!res.ok) {
        toast.error(data.error ?? "O assistente não conseguiu responder.");
        return;
      }
      if (data.pendente) setPendente(data.pendente);
      if (data.aviso) toast.info(data.aviso);
      const escreveu = (data.eventos ?? []).some((e: { tool: string; ok: boolean }) => e.ok && FERRAMENTAS_DE_ESCRITA.has(e.tool));
      if (data.navegar) router.push(data.navegar);
      else if (escreveu) router.refresh();
    } catch {
      toast.error("Falha de conexão com o assistente.");
    } finally {
      setPensando(false);
    }
  }

  function enviar(msg?: string) {
    const m = (msg ?? texto).trim();
    const prontos = anexos.filter((a) => !a.enviando);
    if ((!m && !prontos.length) || pensando || anexos.some((a) => a.enviando)) return;
    setTexto("");
    setAnexos([]);
    const linhas = prontos.map((a) => `[Anexo: ${a.nome} (anexo=${a.caminho})]`);
    const otimista: Content[] = [...history, { role: "user", parts: [{ text: [m || "Veja o anexo.", ...linhas].join("\n") }] }];
    setHistory(otimista);
    void chamar({ mensagem: m, anexos: prontos }, history);
  }

  // 📎 envia direto ao Storage (URL assinada), sem passar pelo limite da Vercel
  async function anexar(lista: FileList | File[] | null) {
    for (const file of Array.from(lista ?? []).slice(0, 5)) {
      const previa = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      const temp: Anexo = { caminho: `tmp-${file.name}-${file.size}-${Math.random().toString(36).slice(2, 6)}`, nome: file.name, enviando: true, previa };
      setAnexos((xs) => [...xs, temp]);
      try {
        const prep = await fetch("/api/assistente/anexo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: file.name, tamanho: file.size }),
        });
        const dados = await prep.json().catch(() => ({}));
        if (!prep.ok) throw new Error(dados.error ?? "Não foi possível anexar.");
        const { error } = await criarSupabase().storage.from("documents").uploadToSignedUrl(dados.caminho, dados.token, file, { contentType: file.type || undefined });
        if (error) throw new Error("Falha ao enviar o arquivo.");
        setAnexos((xs) => xs.map((x) => (x === temp ? { caminho: dados.caminho, nome: file.name, previa } : x)));
      } catch (e) {
        setAnexos((xs) => xs.filter((x) => x !== temp));
        toast.error(e instanceof Error ? e.message : "Não foi possível anexar.");
      }
    }
    if (arquivoRef.current) arquivoRef.current.value = "";
  }

  // Ctrl+V com imagem na área de transferência (print, foto copiada) vira anexo; texto cola normal
  function aoColar(e: React.ClipboardEvent) {
    const itens = Array.from(e.clipboardData?.items ?? []).filter((i) => i.kind === "file");
    if (!itens.length || e.clipboardData.getData("text/plain").trim()) return;
    const arquivos = itens
      .map((i, k) => {
        const f = i.getAsFile();
        if (!f) return null;
        const ext = (f.type.split("/")[1] ?? "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "");
        const hora = new Date().toLocaleTimeString("pt-BR", { hour12: false }).replace(/:/g, "");
        return f.name && !/^image\.\w+$/i.test(f.name) ? f : new File([f], `imagem-colada-${hora}${k ? `-${k + 1}` : ""}.${ext}`, { type: f.type });
      })
      .filter((f): f is File => !!f);
    if (!arquivos.length) return;
    e.preventDefault();
    void anexar(arquivos);
  }

  // arrastar e soltar arquivos/fotos em cima do assistente
  function temArquivos(e: React.DragEvent) {
    return Array.from(e.dataTransfer?.types ?? []).includes("Files");
  }

  function novaConversa() {
    setAnexos([]);
    setHistory([]);
    setPendente(null);
    setTexto("");
  }

  const naFicha = /^\/admin\/clients\/[0-9a-f-]{36}/i.test(pathname);
  const txt = pagina ? "text-[15px]" : "text-[13.5px]";
  const sugestoes = [
    "Quais prazos vencem esta semana?",
    naFicha ? "Resuma este cliente pra mim" : "Quais clientes têm demanda urgente na ficha de handoff?",
    "Crie uma atividade de revisão de contrato para…",
    "Ache o contrato social do cliente…",
  ];

  // monta a conversa visível a partir do histórico do Gemini
  const itens: React.ReactNode[] = [];
  history.forEach((c, ci) => {
    const parts = c.parts ?? [];
    if (c.role === "user") {
      const bruto = parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("\n");
      const nomes = [...bruto.matchAll(RE_ANEXO)].map((m) => m[1]);
      const t = bruto.replace(RE_ANEXO, "").replace(/\n+$/, "").replace(/^Veja o anexo\.$/, "");
      if (t || nomes.length)
        itens.push(
          <div key={ci} className="flex flex-col items-end gap-1.5">
            {nomes.map((n) => (
              <span key={n} className="inline-flex max-w-[85%] items-center gap-1.5 rounded-xl bg-navy/[0.08] px-2.5 py-1.5 text-xs font-medium text-navy-3">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{n}</span>
              </span>
            ))}
            {t && <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy leading-relaxed text-white ${pagina ? "px-4 py-2.5" : "px-3.5 py-2"} ${txt}`}>{t}</div>}
          </div>
        );
      parts
        .filter((p) => p.functionResponse?.response && p.functionResponse.response.ok === false)
        .forEach((p, pi) =>
          itens.push(
            <div key={`${ci}-r${pi}`} className="flex items-center gap-1.5 text-xs text-status-danger">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {p.functionResponse?.response?.cancelado ? "Exclusão cancelada" : p.functionResponse?.response?.erro ?? "Falhou"}
            </div>
          )
        );
      return;
    }
    // carregar_ferramentas é bastidor (liga mais ferramentas), não aparece
    const chamadas = parts.filter((p) => p.functionCall && p.functionCall.name !== "carregar_ferramentas");
    if (chamadas.length)
      itens.push(
        <div key={`${ci}-f`} className="flex flex-wrap gap-1.5">
          {chamadas.map((p, pi) => (
            <span key={pi} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-muted ring-1 ring-border">
              {(p.functionCall!.name ?? "").startsWith("excluir_") ? (
                <Trash2 className="h-3 w-3 text-status-danger" aria-hidden />
              ) : FERRAMENTAS_DE_ESCRITA.has(p.functionCall!.name ?? "") ? (
                <Check className="h-3 w-3 text-status-success" aria-hidden />
              ) : (
                <Wrench className="h-3 w-3" aria-hidden />
              )}
              {ROTULO_FERRAMENTA[p.functionCall!.name ?? ""] ?? p.functionCall!.name}
            </span>
          ))}
        </div>
      );
    const t = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n");
    if (t.trim())
      itens.push(
        <div key={`${ci}-t`} className="flex gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-2">
            <Sparkles className="h-3 w-3 text-gold-2" aria-hidden />
          </span>
          <div className={`min-w-0 leading-relaxed text-foreground ${txt} ${pagina ? "max-w-[88%] rounded-2xl rounded-tl-md bg-surface px-4 py-3 shadow-sm ring-1 ring-border" : "flex-1"}`}>
            <Markdown texto={t} onLink={() => {}} />
          </div>
        </div>
      );
  });

  if (!montado) return null;

  const conteudo = (
    <>
      {/* botão flutuante */}
      {!pagina && (
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label={aberto ? "Fechar assistente" : "Abrir assistente"}
        aria-expanded={aberto}
        data-tip={aberto ? undefined : "Assistente (Ctrl+J)"}
        className={`fixed right-5 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-navy-2 text-white shadow-lg ring-1 ring-gold/40 transition-transform duration-200 hover:scale-105 active:scale-95 ${
          aberto ? "max-sm:hidden" : ""
        }`}
      >
        {aberto ? <X className="h-5 w-5" aria-hidden /> : <Sparkles className="h-6 w-6 text-gold-2" aria-hidden />}
      </button>
      )}

      {aberto && (
        <section
          ref={pagina ? undefined : janela.ref}
          role="dialog"
          aria-label="Assistente do portal"
          onDragEnter={(e) => {
            if (temArquivos(e) && !pendente) setArrastando(true);
          }}
          onDragOver={(e) => {
            if (temArquivos(e) && !pendente) e.preventDefault();
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
          }}
          onDrop={(e) => {
            if (!temArquivos(e)) return;
            e.preventDefault();
            setArrastando(false);
            if (!pendente) void anexar(e.dataTransfer.files);
          }}
          style={pagina ? undefined : janela.estilo}
          className={
            pagina
              ? tela
                ? "flex h-[calc(100dvh-9.5rem)] min-h-[480px] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
                : "mx-auto flex h-[100dvh] w-full max-w-[680px] flex-col overflow-hidden bg-surface sm:border-x sm:border-border"
              : `fixed z-40 flex animate-enter flex-col overflow-hidden bg-surface max-sm:inset-0 sm:rounded-2xl sm:border sm:border-border ${
                  janela.rect ? "" : "sm:right-5 sm:bottom-24 sm:h-[min(640px,calc(100vh-8rem))] sm:w-[400px]"
                } ${janela.mexendo ? "shadow-xl ring-2 ring-gold/30" : "shadow-lg"}`
          }
        >
          {arrastando && (
            <div className="pointer-events-none absolute inset-2 z-50 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-navy-3 bg-surface/90 text-center">
              <Paperclip className="h-6 w-6 text-navy-3" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Solte para anexar</p>
              <p className="text-xs text-muted">fotos, PDF, Word, Excel…</p>
            </div>
          )}
          {!pagina && <AlcasRedimensionar onRedimensionar={janela.onRedimensionar} />}
          <header
            onPointerDown={pagina ? undefined : janela.onArrastar}
            className={`flex shrink-0 items-center gap-3 bg-navy-2 text-white ${tela ? "px-5 py-3.5" : pagina ? "px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3" : `px-4 py-3 sm:touch-none sm:select-none ${janela.mexendo ? "sm:cursor-grabbing" : "sm:cursor-grab"}`}`}
            title={pagina ? undefined : "Arraste para mover"}
          >
            {pagina ? (
              // eslint-disable-next-line @next/next/no-img-element -- ícone estático pequeno
              <img src="/brand/app-192.png" alt="" width={38} height={38} className="h-[38px] w-[38px] rounded-full ring-1 ring-gold/40" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 ring-1 ring-gold/40">
                <Sparkles className="h-4 w-4 text-gold-2" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <p className={`font-semibold ${pagina ? "text-[16px]" : "text-sm"}`}>{tela ? "IA do escritório" : "Assistente MC"}</p>
              <p className="flex items-center gap-1.5 text-[11.5px] text-white/60">
                {pensando ? (
                  "escrevendo…"
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden /> pronto para ajudar
                  </>
                )}
              </p>
            </div>
            {!pagina && janela.rect && (
              <button type="button" onClick={janela.restaurar} className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white max-sm:hidden" aria-label="Voltar ao canto padrão" data-tip="Voltar ao canto padrão">
                <CornerRightDown className="h-4 w-4" />
              </button>
            )}
            {pagina && publicacoes !== null && (
              <a
                href="/admin/publicacoes"
                className="relative rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={`Publicações (${publicacoes} não tratadas)`}
                data-tip="Publicações"
              >
                <Bell className="h-4 w-4" />
                {publicacoes > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 rounded-full bg-gold px-1 text-[9px] leading-[14px] font-semibold text-navy-2">
                    {publicacoes > 99 ? "99+" : publicacoes}
                  </span>
                )}
              </a>
            )}
            <button type="button" onClick={novaConversa} className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white" aria-label="Nova conversa" data-tip="Nova conversa">
              <RotateCcw className="h-4 w-4" />
            </button>
            {!pagina && (
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white" aria-label="Fechar" data-tip="Fechar">
                <X className="h-4 w-4" />
              </button>
            )}
          </header>

          <div className={`flex-1 overflow-y-auto overscroll-contain ${tela ? "space-y-4 bg-background px-[max(1rem,calc((100%-52rem)/2))] py-6" : pagina ? "space-y-4 bg-background px-4 py-5" : "space-y-3.5 px-4 py-4"}`}>
            {history.length === 0 && (
              <div className={pagina ? "flex min-h-full flex-col items-center justify-center px-2 pb-6 text-center" : "pt-2"}>
                {pagina && (
                  // eslint-disable-next-line @next/next/no-img-element -- ícone estático pequeno
                  <img src="/brand/app-192.png" alt="" width={64} height={64} className="mb-4 h-16 w-16 rounded-2xl shadow-md" />
                )}
                <p className={`font-semibold text-foreground ${pagina ? "text-[22px] tracking-tight" : "text-[15px]"}`}>Oi, {nome}. O que vamos fazer?</p>
                <p className="mt-1 text-[13px] text-muted">Escreva, fale ou anexe um arquivo/foto. Eu consulto e executo no portal; para excluir, peço sua confirmação.</p>
                <div className={pagina ? "mt-6 flex flex-wrap justify-center gap-2" : "mt-4 flex flex-col gap-2"}>
                  {sugestoes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => (s.endsWith("…") ? (setTexto(s.replace("…", " ")), inputRef.current?.focus()) : enviar(s))}
                      className={
                        pagina
                          ? "rounded-full border border-border bg-surface px-4 py-2 text-[14px] text-foreground shadow-sm transition-colors active:bg-surface-2"
                          : "rounded-xl border border-border bg-surface px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:border-border-strong hover:bg-surface-2"
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {itens}

            {pendente && (pendente.tipo === "envio" ? (
              <div className="animate-enter rounded-2xl border border-status-success/30 bg-status-success-bg p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-status-success">
                  <Send className="h-4 w-4" aria-hidden /> Confirma o envio no WhatsApp?
                </p>
                <ul className="mt-2 space-y-2">
                  {pendente.itens.map((i, k) => (
                    <li key={k} className="whitespace-pre-wrap text-[13px] text-foreground">
                      {i.resumo}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => void chamar({ confirmacao: { aprovado: false } }, history)} className="ui-btn-secondary px-3 py-1.5 text-xs">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void chamar({ confirmacao: { aprovado: true } }, history)} className="ui-btn bg-status-success px-3 py-1.5 text-xs hover:bg-status-success/90">
                    <Send className="h-3.5 w-3.5" aria-hidden /> Enviar
                  </button>
                </div>
              </div>
            ) : pendente.tipo === "alteracao" ? (
              <div className="animate-enter rounded-2xl border border-status-pending/30 bg-status-pending-bg p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-status-pending">
                  <AlertTriangle className="h-4 w-4" aria-hidden /> Confirma a alteração?
                </p>
                <ul className="mt-2 space-y-1">
                  {pendente.itens.map((i, k) => (
                    <li key={k} className="text-[13px] text-foreground">
                      {i.resumo}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => void chamar({ confirmacao: { aprovado: false } }, history)} className="ui-btn-secondary px-3 py-1.5 text-xs">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void chamar({ confirmacao: { aprovado: true } }, history)} className="ui-btn px-3 py-1.5 text-xs">
                    <Check className="h-3.5 w-3.5" aria-hidden /> Confirmar
                  </button>
                </div>
              </div>
            ) : (
              <div className="animate-enter rounded-2xl border border-status-danger/30 bg-status-danger-bg p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-status-danger">
                  <AlertTriangle className="h-4 w-4" aria-hidden /> Confirma a exclusão?
                </p>
                <ul className="mt-2 space-y-1">
                  {pendente.itens.map((i, k) => (
                    <li key={k} className="text-[13px] text-foreground">
                      {i.resumo}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => void chamar({ confirmacao: { aprovado: false } }, history)} className="ui-btn-secondary px-3 py-1.5 text-xs">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => void chamar({ confirmacao: { aprovado: true } }, history)} className="ui-btn bg-status-danger px-3 py-1.5 text-xs hover:bg-status-danger/90">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Confirmar exclusão
                  </button>
                </div>
              </div>
            ))}

            {pensando && (
              <div className="flex items-center gap-2.5" role="status" aria-label="Pensando">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-2">
                  <Sparkles className="h-3 w-3 text-gold-2" aria-hidden />
                </span>
                <span className="flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </span>
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
            className={`shrink-0 border-t border-border bg-surface ${tela ? "px-[max(0.75rem,calc((100%-52rem)/2))] py-3" : pagina ? "px-3 pt-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]" : "p-3"}`}
          >
            {anexos.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {anexos.map((a) => (
                  <span key={a.caminho} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-surface-2 py-1 pr-1 pl-2 text-xs text-foreground ring-1 ring-border">
                    {a.enviando ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden />
                    ) : a.previa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.previa} alt="" className="h-6 w-6 rounded object-cover" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-navy-3" aria-hidden />
                    )}
                    <span className="max-w-[180px] truncate">{a.nome}</span>
                    <button type="button" onClick={() => setAnexos((xs) => xs.filter((x) => x !== a))} className="rounded p-0.5 text-muted hover:bg-border hover:text-foreground" aria-label={`Remover ${a.nome}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div
              className={
                pagina
                  ? "flex items-end gap-1 rounded-[26px] bg-surface-2 px-1.5 py-1.5 ring-1 ring-border transition-shadow focus-within:ring-navy-3/50"
                  : "flex items-end gap-2 rounded-2xl border border-border-strong bg-surface px-2 py-1.5 transition-shadow focus-within:border-navy-3 focus-within:shadow-[0_0_0_3px_rgba(19,50,90,0.12)]"
              }
            >
              <textarea
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onPaste={aoColar}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                rows={1}
                placeholder={pendente ? "Confirme ou cancele acima…" : pagina ? "Mensagem (cole ou arraste imagens aqui)" : "Peça algo… (Enter envia · cole imagens com Ctrl+V)"}
                disabled={!!pendente}
                className={`max-h-32 flex-1 resize-none bg-transparent text-foreground outline-none focus-visible:outline-none placeholder:text-muted/70 [field-sizing:content] ${
                  pagina ? "min-h-[40px] px-2.5 py-2 text-base" : "min-h-[36px] px-1.5 py-2 text-base sm:text-[13.5px]"
                }`}
              />
              <input
                ref={arquivoRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xlsx,.csv,.txt,.md,image/*"
                className="hidden"
                onChange={(e) => void anexar(e.target.files)}
              />
              <button
                type="button"
                onClick={() => arquivoRef.current?.click()}
                disabled={!!pendente}
                className={pagina ? "icon-btn h-10 w-10 rounded-full" : "icon-btn border border-border bg-surface"}
                aria-label="Anexar arquivo ou foto"
                data-tip="Anexar arquivo ou foto"
              >
                <Paperclip aria-hidden />
              </button>
              <AudioAnswer modo="comando" grande={pagina} onTexto={(t) => enviar(t)} />
              <button
                type="submit"
                disabled={(!texto.trim() && !anexos.length) || pensando || !!pendente || anexos.some((a) => a.enviando)}
                aria-label="Enviar"
                className={`flex shrink-0 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy-3 disabled:opacity-40 ${pagina ? "h-10 w-10" : "h-8 w-8"}`}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
            {!pagina && <p className="mt-1.5 px-1 text-[10.5px] text-muted">Gemini pode errar. Confira o que for importante.</p>}
          </form>
        </section>
      )}
    </>
  );
  return pagina ? conteudo : createPortal(conteudo, document.body);
}

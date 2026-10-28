"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Download, FileText, Loader2, NotebookPen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { segundos, TIPOS_ATA, type TipoAta } from "@/lib/atas/formato";
import { nomeDeArquivo, textoDoDocumento, type ParteExport } from "@/lib/transcricao-formato";
import { abrirNoGoogleDocsAction, gerarResumoAction, salvarTranscricaoAction } from "../../transcricao/actions";
import { salvarAtaAction } from "../actions";

// A reunião entregue: transcrição fiel (com quem falou e o tempo) e resumo com
// IA, editáveis, para baixar em PDF, TXT ou Word, abrir no Google Docs ou copiar.
// De dentro dela sai a ata ("Gerar ata"), que segue o fluxo de revisão/assinatura.
export function ReuniaoEntrega({
  ataId,
  transcricaoId,
  titulo,
  criadaEm,
  duracao,
  tipo,
  texto: textoInicial,
  resumo: resumoInicial,
  audio,
  gerando,
  erro,
}: {
  ataId: string;
  transcricaoId: string;
  titulo: string;
  criadaEm: string;
  duracao: number | null;
  tipo: TipoAta;
  texto: string;
  resumo: string;
  audio: string | null;
  gerando: boolean;
  erro: string | null;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<"resumo" | "texto">(resumoInicial.trim() ? "resumo" : "texto");
  const [texto, setTexto] = useState(textoInicial);
  const [resumo, setResumo] = useState(resumoInicial);
  const [parte, setParte] = useState<ParteExport>("ambos");
  const [salvo, setSalvo] = useState<"salvo" | "editando" | "salvando">("salvo");
  const [resumindo, setResumindo] = useState(false);
  const [instrucao, setInstrucao] = useState("");
  const [docs, setDocs] = useState(false);
  const [modelo, setModelo] = useState<TipoAta>(tipo);
  const [pedindo, setPedindo] = useState(false);
  const player = useRef<HTMLAudioElement>(null);
  const pendente = useRef<{ texto?: string; resumo?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // acompanha a geração da ata
  useEffect(() => {
    if (!gerando) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [gerando, router]);

  async function salvarAgora(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    const campos = pendente.current;
    if (!Object.keys(campos).length) return true;
    pendente.current = {};
    setSalvo("salvando");
    const r = await salvarTranscricaoAction(transcricaoId, campos);
    setSalvo("salvo");
    if (!r.ok) {
      pendente.current = { ...campos, ...pendente.current };
      toast.error(r.erro ?? "Não foi possível salvar.");
    }
    return r.ok;
  }

  function editar(campo: "texto" | "resumo", v: string) {
    if (campo === "texto") setTexto(v);
    else setResumo(v);
    pendente.current = { ...pendente.current, [campo]: v };
    setSalvo("editando");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvarAgora(), 1500);
  }

  // ao sair da página, não perde o que ainda não salvou
  useEffect(
    () => () => {
      if (Object.keys(pendente.current).length) void salvarTranscricaoAction(transcricaoId, pendente.current);
    },
    [transcricaoId]
  );

  const temOsDois = !!texto.trim() && !!resumo.trim();
  const parteEfetiva: ParteExport = temOsDois ? parte : texto.trim() ? "texto" : "resumo";
  const dados = { titulo, created_at: criadaEm, duracao_seg: duracao, arquivo_nome: null, texto, resumo };
  const atual = aba === "texto" ? texto : resumo;
  const palavras = atual.trim() ? atual.trim().split(/\s+/).length : 0;

  function tocar(hms: string) {
    const a = player.current;
    if (!a) return void toast("A gravação não está mais disponível.");
    a.currentTime = Math.max(0, segundos(hms) - 2);
    void a.play();
  }

  async function baixar(formato: "txt" | "pdf" | "docx") {
    if (!(await salvarAgora())) return;
    const a = document.createElement("a");
    if (formato === "txt") {
      a.href = URL.createObjectURL(new Blob([textoDoDocumento(dados, parteEfetiva)], { type: "text/plain;charset=utf-8" }));
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else {
      a.href = `/api/transcricao/${transcricaoId}/arquivo?formato=${formato}&parte=${parteEfetiva}`;
    }
    a.download = nomeDeArquivo(titulo, formato);
    a.click();
  }

  async function googleDocs() {
    if (!(await salvarAgora())) return;
    // abre a aba já (o navegador bloqueia popup aberto depois de esperar)
    const janela = window.open("about:blank", "_blank");
    setDocs(true);
    const r = await abrirNoGoogleDocsAction(transcricaoId, parteEfetiva);
    setDocs(false);
    if (!r.ok) {
      janela?.close();
      return void toast.error(r.erro);
    }
    if (janela) janela.location.href = r.url;
    else window.open(r.url, "_blank");
    toast.success("Google Docs criado na pasta Transcrições do Drive.");
  }

  async function refazerResumo() {
    if (!(await salvarAgora())) return;
    setResumindo(true);
    const r = await gerarResumoAction(transcricaoId, instrucao);
    setResumindo(false);
    if (!r.ok) return void toast.error(r.erro);
    setResumo(r.resumo);
    setAba("resumo");
    toast.success("Resumo refeito.");
  }

  async function gerarAta() {
    if (!(await salvarAgora())) return;
    setPedindo(true);
    try {
      await salvarAtaAction(ataId, { tipo: modelo });
      const r = await fetch(`/api/atas/${ataId}/gerar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etapa: "ata" }) });
      if (!r.ok) return void toast.error((await r.json().catch(() => ({}))).error ?? "Não deu certo.");
      router.refresh();
    } finally {
      setPedindo(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {audio && (
          <div className="sticky top-16 z-10 mb-3 rounded-xl border border-border bg-surface/95 p-2 backdrop-blur">
            <audio ref={player} controls src={audio} preload="metadata" className="h-9 w-full" />
          </div>
        )}
        <div className="ui-card overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist">
              {(
                [
                  ["resumo", "Resumo com IA"],
                  ["texto", "Transcrição fiel"],
                ] as const
              ).map(([id, rotulo]) => (
                <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`rounded-md px-3 py-1.5 text-sm ${aba === id ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}>
                  {rotulo}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">
              {salvo === "salvo" ? "Salvo" : salvo === "salvando" ? "Salvando…" : "Editando…"} · {palavras.toLocaleString("pt-BR")} palavras
            </span>
          </div>

          {aba === "resumo" && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/40 px-5 py-3">
              <input value={instrucao} onChange={(e) => setInstrucao(e.target.value)} maxLength={600} placeholder="Instrução opcional (ex.: foque nos prazos e valores)" className="ui-input min-w-[220px] flex-1 !py-1.5 text-sm" aria-label="Instrução para o resumo" />
              <button type="button" onClick={() => void refazerResumo()} disabled={resumindo || !texto.trim()} className="ui-btn-secondary px-3 py-1.5 text-sm">
                {resumindo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} {resumo.trim() ? "Refazer resumo" : "Gerar resumo"}
              </button>
            </div>
          )}

          {aba === "texto" && audio && texto.trim() && (
            <p className="border-b border-border bg-surface-2/40 px-5 py-2 text-xs text-muted">Clique no tempo, como [00:12:40], para ouvir aquele trecho (disponível enquanto a gravação estiver guardada).</p>
          )}

          <div className="p-5">
            {aba === "texto" && audio ? (
              <>
                <pre className="mb-3 max-h-[40vh] overflow-y-auto font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                  {texto.split("\n").map((l, i) => {
                    const m = l.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
                    return (
                      <span key={i}>
                        {m ? (
                          <button type="button" onClick={() => tocar(m[1])} className="font-mono text-xs text-muted hover:text-foreground">
                            [{m[1]}]
                          </button>
                        ) : null}
                        {m ? l.slice(m[0].length) : l}
                        {"\n"}
                      </span>
                    );
                  })}
                </pre>
                <p className="mb-1 text-xs text-muted">Para corrigir alguma palavra, edite aqui:</p>
                <textarea value={texto} onChange={(e) => editar("texto", e.target.value)} rows={12} spellCheck className="ui-input min-h-[30vh] resize-y text-[14px] leading-relaxed" aria-label="Transcrição" />
              </>
            ) : (
              <textarea
                value={atual}
                onChange={(e) => editar(aba, e.target.value)}
                rows={22}
                spellCheck
                placeholder={aba === "resumo" ? "Ainda sem resumo. Clique em “Gerar resumo”." : ""}
                className="ui-input min-h-[55vh] resize-y text-[14px] leading-relaxed"
                aria-label={aba === "resumo" ? "Resumo" : "Transcrição"}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/40 px-5 py-3">
            <button type="button" onClick={() => void navigator.clipboard.writeText(atual).then(() => toast.success("Copiado."))} disabled={!atual.trim()} className="ui-btn-secondary px-3 py-1.5 text-sm">
              <Copy className="h-4 w-4" aria-hidden /> Copiar
            </button>
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
            <span className="text-xs text-muted">Baixar</span>
            {temOsDois && (
              <select value={parte} onChange={(e) => setParte(e.target.value as ParteExport)} className="ui-input !w-auto !py-1.5 text-sm" aria-label="O que vai no arquivo">
                <option value="ambos">Transcrição + resumo</option>
                <option value="texto">Só a transcrição</option>
                <option value="resumo">Só o resumo</option>
              </select>
            )}
            {(["txt", "pdf", "docx"] as const).map((f) => (
              <button key={f} type="button" onClick={() => void baixar(f)} className="ui-btn-secondary px-3 py-1.5 text-sm">
                <Download className="h-4 w-4" aria-hidden /> {f === "docx" ? "Word" : f.toUpperCase()}
              </button>
            ))}
            <button type="button" onClick={() => void googleDocs()} disabled={docs} className="ui-btn-secondary px-3 py-1.5 text-sm">
              {docs ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />} Google Docs
            </button>
          </div>
        </div>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <section className="ui-card p-5">
          <h2 className="section-title !text-base">Gerar ata</h2>
          <p className="mt-1 text-sm text-muted">
            Se esta reunião precisa de ata, a IA escreve a partir da transcrição, no modelo escolhido. Você revisa, aprova e o portal colhe as assinaturas. Só gasta IA quando você clicar.
          </p>
          {erro && (
            <p className="mt-3 flex gap-2 rounded-lg bg-status-danger-bg p-3 text-sm text-status-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>Não deu para gerar a ata: {erro}</span>
            </p>
          )}
          <label htmlFor="modelo-ata" className="ui-label mt-3 block">
            Modelo da ata
          </label>
          <select id="modelo-ata" value={modelo} onChange={(e) => setModelo(e.target.value as TipoAta)} disabled={gerando || pedindo} className="ui-input mt-1">
            {(Object.keys(TIPOS_ATA) as TipoAta[]).map((k) => (
              <option key={k} value={k}>
                {TIPOS_ATA[k].rotulo}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void gerarAta()} disabled={gerando || pedindo || !texto.trim()} className="ui-btn mt-3 w-full justify-center">
            {gerando || pedindo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <NotebookPen className="h-4 w-4" aria-hidden />}
            {gerando ? "Gerando a ata…" : erro ? "Tentar de novo" : "Gerar ata"}
          </button>
        </section>
      </aside>
    </div>
  );
}

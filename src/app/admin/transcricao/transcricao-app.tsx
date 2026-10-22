"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  Check,
  Copy,
  Download,
  FileAudio,
  FileText,
  Loader2,
  MessageCircle,
  Mic,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  abrirNoGoogleDocsAction,
  abrirTranscricaoAction,
  criarTranscricaoAction,
  criarTranscricaoDoWhatsappAction,
  excluirTranscricaoAction,
  gerarResumoAction,
  listarAudiosDoWhatsappAction,
  listarTranscricoesAction,
  salvarTranscricaoAction,
  type Transcricao,
  type TranscricaoItem,
} from "./actions";
import {
  MODO_ROTULO,
  dataLegivel,
  duracaoLegivel,
  nomeDeArquivo,
  textoDoDocumento,
  tituloDoAudio,
  type AudioZap,
  type ModoTranscricao,
  type ParteExport,
} from "@/lib/transcricao-formato";

const ACEITA = "audio/*,video/*,.ogg,.oga,.opus,.m4a,.mp3,.wav,.aac,.amr,.wma,.flac,.mp4,.mov,.webm,.3gp,.mkv,.avi";
const LIMITE = 1024 ** 3;
const tamanho = (b: number) => (b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Andamento = { etapa: "envio" | "preparo" | "ia"; pct: number; inicio: number; duracao?: number; doZap?: boolean };
/** de onde vem o áudio: arquivo/gravação ou uma mensagem do WhatsApp do portal */
type Fonte = { arquivo: File } | { zap: AudioZap };
type DadosNova = { titulo: string; modo: ModoTranscricao; falantes: boolean; tempo: boolean; instrucao: string };

/** PUT do arquivo direto pro servidor de mídia, com progresso. */
function enviarArquivo(url: string, arquivo: File, onPct: (p: number) => void, onEnviado: () => void): Promise<{ ok: boolean; duracao?: number; erro?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    xhr.upload.onload = onEnviado;
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ ok: false, erro: xhr.status === 403 ? "O link de envio venceu. Tente de novo." : `O servidor respondeu ${xhr.status}.` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, erro: "Falha de conexão ao enviar o arquivo." });
    xhr.send(arquivo);
  });
}

export function TranscricaoApp({
  inicial,
  meuId,
  souAdmin,
  podeWhatsapp,
  zapInicial,
  abertaInicial,
}: {
  inicial: TranscricaoItem[];
  meuId: string;
  souAdmin: boolean;
  podeWhatsapp: boolean;
  zapInicial: AudioZap | null;
  abertaInicial: Transcricao | null;
}) {
  const [lista, setLista] = useState(inicial);
  const [aberta, setAberta] = useState<Transcricao | null>(abertaInicial);
  const [carregando, setCarregando] = useState<string | null>(null);
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [busca, setBusca] = useState("");

  const recarregarLista = useCallback(async () => setLista(await listarTranscricoesAction()), []);

  const abrir = useCallback(async (id: string) => {
    setCarregando(id);
    try {
      const t = await abrirTranscricaoAction(id);
      if (!t) return void toast.error("Transcrição não encontrada.");
      setAberta(t);
    } finally {
      setCarregando(null);
    }
  }, []);

  // transcrição em andamento (outra aba ou que ficou rodando): confere a cada 6 s
  const emAndamento = aberta && (aberta.status === "processando" || aberta.status === "enviando") && !andamento;
  useEffect(() => {
    if (!emAndamento || !aberta) return;
    const t = setInterval(async () => {
      const novo = await abrirTranscricaoAction(aberta.id);
      if (novo && novo.status !== aberta.status) {
        setAberta(novo);
        void recarregarLista();
      }
    }, 6000);
    return () => clearInterval(t);
  }, [emAndamento, aberta, recarregarLista]);

  async function processar(id: string, duracao: number | undefined) {
    setAndamento((a) => ({ etapa: "ia", pct: 100, inicio: Date.now(), duracao: duracao ?? a?.duracao }));
    try {
      const r = await fetch(`/api/transcricao/${id}/processar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ duracao }) });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) toast.error(dados.error ?? "Não foi possível transcrever.");
      else toast.success("Transcrição pronta.");
    } catch {
      toast.error("A conexão caiu, mas a transcrição continua no servidor. Abra pelo histórico daqui a pouco.");
    } finally {
      setAndamento(null);
      await abrir(id);
      void recarregarLista();
    }
  }

  async function comecar(fonte: Fonte, dados: DadosNova) {
    if ("zap" in fonte) {
      setAberta(null);
      setAndamento({ etapa: "envio", pct: 0, inicio: Date.now(), doZap: true });
      const z = await criarTranscricaoDoWhatsappAction({
        msgId: fonte.zap.id,
        titulo: dados.titulo,
        modo: dados.modo,
        opcoes: { falantes: dados.falantes, tempo: dados.tempo, instrucao: dados.instrucao },
      });
      if (!z.ok) {
        setAndamento(null);
        return void toast.error(z.erro);
      }
      void recarregarLista();
      return processar(z.id, z.duracao);
    }
    const arquivo = fonte.arquivo;
    const c = await criarTranscricaoAction({ titulo: dados.titulo, arquivoNome: arquivo.name, modo: dados.modo, opcoes: { falantes: dados.falantes, tempo: dados.tempo, instrucao: dados.instrucao } });
    if (!c.ok) return void toast.error(c.erro);
    setAberta(null);
    setAndamento({ etapa: "envio", pct: 0, inicio: Date.now() });
    void recarregarLista();
    const r = await enviarArquivo(
      c.envio,
      arquivo,
      (pct) => setAndamento((a) => (a ? { ...a, pct } : a)),
      () => setAndamento((a) => (a ? { ...a, etapa: "preparo", pct: 100 } : a))
    );
    if (!r.ok) {
      setAndamento(null);
      toast.error(r.erro ?? "Não foi possível enviar o arquivo.");
      await excluirTranscricaoAction(c.id);
      void recarregarLista();
      return;
    }
    await processar(c.id, r.duracao);
  }

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? lista.filter((x) => x.titulo.toLowerCase().includes(t) || (x.arquivo_nome ?? "").toLowerCase().includes(t) || (x.dono ?? "").toLowerCase().includes(t)) : lista;
  }, [lista, busca]);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {andamento ? (
          <Progresso a={andamento} />
        ) : aberta ? (
          <Resultado
            key={aberta.id}
            t={aberta}
            mostrarDono={souAdmin && aberta.profile_id !== meuId}
            onNova={() => setAberta(null)}
            onMudou={(campos) => {
              setAberta((x) => (x ? { ...x, ...campos } : x));
              if (campos.titulo !== undefined) setLista((l) => l.map((i) => (i.id === aberta.id ? { ...i, titulo: campos.titulo! } : i)));
            }}
            onExcluida={() => {
              setLista((l) => l.filter((i) => i.id !== aberta.id));
              setAberta(null);
            }}
            onTentarDeNovo={() => void processar(aberta.id, aberta.duracao_seg ?? undefined)}
          />
        ) : (
          <NovaTranscricao onComecar={comecar} podeWhatsapp={podeWhatsapp} zapInicial={zapInicial} />
        )}
      </div>

      <aside className="xl:sticky xl:top-20 xl:self-start">
        <div className="ui-card overflow-hidden p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="section-title !text-base">Histórico</h2>
            <button type="button" onClick={() => setAberta(null)} disabled={!!andamento} className="ui-btn-secondary px-2.5 py-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Nova
            </button>
          </div>
          {lista.length > 4 && (
            <label className="relative block border-b border-border px-3 py-2">
              <Search className="pointer-events-none absolute top-1/2 left-6 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" className="ui-input !py-1.5 pl-8 text-sm" aria-label="Buscar no histórico" />
            </label>
          )}
          {filtrada.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">{lista.length ? "Nada encontrado." : "Suas transcrições aparecem aqui."}</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {filtrada.map((i) => {
                const ativa = aberta?.id === i.id;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      disabled={!!andamento}
                      onClick={() => void abrir(i.id)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${ativa ? "bg-surface-2" : ""}`}
                    >
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i.status === "erro" ? "bg-status-danger-bg text-status-danger" : "bg-surface-2 text-foreground/70 ring-1 ring-border"}`}>
                        {carregando === i.id || i.status === "processando" || i.status === "enviando" ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : i.status === "erro" ? (
                          <AlertTriangle className="h-4 w-4" aria-hidden />
                        ) : (
                          <FileAudio className="h-4 w-4" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{i.titulo}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {dataLegivel(i.created_at)}
                          {i.duracao_seg ? ` · ${duracaoLegivel(i.duracao_seg)}` : ""}
                          {souAdmin && i.profile_id !== meuId && i.dono ? ` · ${i.dono}` : ""}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {i.status === "erro" ? "Deu erro" : i.status === "pronta" ? MODO_ROTULO[i.modo] : "Transcrevendo…"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ───────── nova transcrição ───────── */

function NovaTranscricao({ onComecar, podeWhatsapp, zapInicial }: { onComecar: (fonte: Fonte, dados: DadosNova) => Promise<void>; podeWhatsapp: boolean; zapInicial: AudioZap | null }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [zap, setZap] = useState<AudioZap | null>(zapInicial);
  const [escolhendoZap, setEscolhendoZap] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [titulo, setTitulo] = useState(zapInicial ? tituloDoAudio(zapInicial) : "");
  const [modo, setModo] = useState<ModoTranscricao>("ambos");
  const [falantes, setFalantes] = useState(true);
  const [tempo, setTempo] = useState(false);
  const [instrucao, setInstrucao] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (previa && URL.revokeObjectURL(previa)), [previa]);

  function escolher(f: File | undefined | null) {
    if (!f) return;
    const pareceMidia = f.type.startsWith("audio/") || f.type.startsWith("video/") || /\.(ogg|oga|opus|m4a|mp3|wav|aac|amr|wma|flac|mp4|mov|webm|3gp|mkv|avi)$/i.test(f.name);
    if (!pareceMidia) return void toast.error("Escolha um arquivo de áudio ou vídeo.");
    if (f.size > LIMITE) return void toast.error("O arquivo passa de 1 GB.");
    if (previa) URL.revokeObjectURL(previa);
    setZap(null);
    setArquivo(f);
    setPrevia(URL.createObjectURL(f));
    setTitulo((t) => t || f.name.replace(/\.[^.]+$/, ""));
  }

  function escolherDoZap(a: AudioZap) {
    setEscolhendoZap(false);
    setArquivo(null);
    setZap(a);
    setTitulo(tituloDoAudio(a));
  }

  async function transcrever() {
    const fonte: Fonte | null = zap ? { zap } : arquivo ? { arquivo } : null;
    if (!fonte) return;
    setEnviando(true);
    try {
      await onComecar(fonte, { titulo, modo, falantes, tempo, instrucao });
    } finally {
      setEnviando(false);
    }
  }

  const MODOS: { id: ModoTranscricao; titulo: string; texto: string; icone: typeof FileText }[] = [
    { id: "ambos", titulo: "Os dois", texto: "Transcrição fiel e resumo com IA.", icone: Sparkles },
    { id: "fiel", titulo: "Transcrição fiel", texto: "Palavra por palavra, exatamente como foi falado.", icone: FileText },
    { id: "resumo", titulo: "Resumo com IA", texto: "Pontos principais, decisões e próximos passos.", icone: Sparkles },
  ];

  return (
    <section className="ui-card p-5 sm:p-6">
      <h2 className="section-title">Nova transcrição</h2>
      <p className="mt-1 text-sm text-muted">Áudio ou vídeo de qualquer formato, até 1 GB (dá para uma reunião de 3 horas). O áudio é apagado depois; fica só o texto.</p>

      {zap ? (
        <div className="mt-5 rounded-2xl border border-border bg-surface-2/50 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25d366] text-white">
              <MessageCircle className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {zap.tipo === "video" ? "Vídeo" : "Áudio"} de {zap.de}
                {zap.de !== zap.conversa ? ` · ${zap.conversa}` : ""}
              </span>
              <span className="block text-xs text-muted">Do WhatsApp · {dataLegivel(zap.quando)}</span>
            </span>
            {podeWhatsapp && (
              <button type="button" onClick={() => setEscolhendoZap(true)} className="ui-btn-secondary hidden px-2.5 py-1.5 text-xs sm:inline-flex">
                Outro áudio
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setZap(null);
                setTitulo("");
              }}
              className="icon-btn h-8 w-8"
              aria-label="Tirar áudio"
              data-tip="Tirar áudio"
            >
              <X aria-hidden />
            </button>
          </div>
          {zap.url && <audio controls src={zap.url} className="mt-3 h-10 w-full" preload="metadata" />}
        </div>
      ) : !arquivo ? (
        <div className={`mt-5 grid gap-3 ${podeWhatsapp ? "sm:grid-cols-[1fr_auto_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              escolher(e.dataTransfer.files[0]);
            }}
            className={`flex min-h-36 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              arrastando ? "border-navy bg-surface-2" : "border-border-strong hover:border-navy hover:bg-surface-2/60"
            }`}
          >
            <Upload className="h-6 w-6 text-muted" aria-hidden />
            <span className="mt-2 text-sm font-medium text-foreground">Arraste o arquivo aqui ou clique para escolher</span>
            <span className="mt-0.5 text-xs text-muted">MP3, M4A, OGG (WhatsApp), WAV, MP4, MOV…</span>
          </button>
          <Gravador onGravado={escolher} />
          {podeWhatsapp && (
            <button type="button" onClick={() => setEscolhendoZap(true)} className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-border px-6 py-6 text-center hover:border-navy hover:bg-surface-2/60 sm:w-44">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25d366] text-white">
                <MessageCircle className="h-5 w-5" aria-hidden />
              </span>
              <span className="mt-2 text-sm font-medium text-foreground">Do WhatsApp</span>
              <span className="text-xs text-muted">um áudio do zap</span>
            </button>
          )}
          <input ref={inputRef} type="file" accept={ACEITA} className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-border bg-surface-2/50 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy text-white">
              <AudioLines className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{arquivo.name}</span>
              <span className="block text-xs text-muted">{tamanho(arquivo.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setArquivo(null);
                setTitulo("");
              }}
              className="icon-btn h-8 w-8"
              aria-label="Trocar arquivo"
              data-tip="Trocar arquivo"
            >
              <X aria-hidden />
            </button>
          </div>
          {previa && <audio controls src={previa} className="mt-3 h-10 w-full" preload="metadata" />}
        </div>
      )}

      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">Título</span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} placeholder="Ex.: Reunião com a 3N Engenharia" className="ui-input" />
      </label>

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium text-foreground">Como transcrever</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODOS.map((m) => {
            const on = modo === m.id;
            return (
              <label
                key={m.id}
                className={`cursor-pointer rounded-xl border p-3 transition-colors ${on ? "border-navy bg-surface-2 ring-1 ring-navy" : "border-border hover:border-border-strong"}`}
              >
                <input type="radio" name="modo" value={m.id} checked={on} onChange={() => setModo(m.id)} className="sr-only" />
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <m.icone className="h-4 w-4 text-foreground/70" aria-hidden /> {m.titulo}
                  {on && <Check className="ml-auto h-4 w-4 text-status-success" aria-hidden />}
                </span>
                <span className="mt-1 block text-xs text-muted">{m.texto}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {modo !== "resumo" && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={falantes} onChange={(e) => setFalantes(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />
            Separar quem fala (Pessoa 1, Pessoa 2…)
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={tempo} onChange={(e) => setTempo(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />
            Marcar o tempo de cada trecho [00:12:34]
          </label>
        </div>
      )}

      {modo !== "fiel" && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            Instrução para o resumo <span className="font-normal text-muted">(opcional)</span>
          </span>
          <textarea
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            maxLength={600}
            rows={2}
            placeholder="Ex.: destaque os riscos trabalhistas e os prazos combinados"
            className="ui-input resize-y"
          />
        </label>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void transcrever()} disabled={(!arquivo && !zap) || enviando} className="ui-btn">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <AudioLines className="h-4 w-4" aria-hidden />} Transcrever
        </button>
        {!arquivo && !zap && <span className="text-xs text-muted">{podeWhatsapp ? "Escolha um arquivo, grave ou puxe um áudio do WhatsApp." : "Escolha um arquivo ou grave um áudio."}</span>}
      </div>
      {escolhendoZap && <EscolherDoZap onEscolher={escolherDoZap} onFechar={() => setEscolhendoZap(false)} />}
    </section>
  );
}

/** Lista dos áudios do WhatsApp do portal (mais recentes primeiro), com busca por conversa. */
function EscolherDoZap({ onEscolher, onFechar }: { onEscolher: (a: AudioZap) => void; onFechar: () => void }) {
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<AudioZap[] | null>(null);
  const [mais, setMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    const n = ++pedido.current;
    const t = setTimeout(
      async () => {
        const r = await listarAudiosDoWhatsappAction({ busca: busca.trim() || undefined });
        if (n !== pedido.current) return;
        setItens(r);
        setMais(r.length >= 30);
        setBuscando(false);
      },
      busca ? 350 : 0
    );
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  async function carregarMais() {
    if (!itens?.length) return;
    setCarregandoMais(true);
    try {
      const r = await listarAudiosDoWhatsappAction({ busca: busca.trim() || undefined, antesDe: itens[itens.length - 1].quando });
      setItens((x) => [...(x ?? []), ...r]);
      setMais(r.length >= 30);
    } finally {
      setCarregandoMais(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Escolher áudio do WhatsApp" onClick={onFechar}>
      <div className="ui-card flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white">
            <MessageCircle className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground">Áudio do WhatsApp</h3>
            <p className="text-xs text-muted">Escolha o áudio (ou vídeo) que vai ser transcrito.</p>
          </div>
          <button type="button" onClick={onFechar} className="icon-btn h-8 w-8" aria-label="Fechar">
            <X aria-hidden />
          </button>
        </div>
        <label className="relative block border-b border-border px-4 py-3">
          <Search className="pointer-events-none absolute top-1/2 left-7 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            autoFocus
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setBuscando(true);
            }}
            placeholder="Buscar conversa (nome ou telefone)"
            className="ui-input !py-2 pr-9 pl-8 text-sm"
            aria-label="Buscar conversa"
          />
          {buscando && <Loader2 className="absolute top-1/2 right-7 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted" aria-label="Buscando" />}
        </label>
        <div className="min-h-40 flex-1 overflow-y-auto">
          {itens === null ? (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando áudios…
            </p>
          ) : itens.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted">{busca.trim() ? "Nenhum áudio nessa conversa." : "Nenhum áudio no WhatsApp ainda."}</p>
          ) : (
            <ul className="divide-y divide-border">
              {itens.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-foreground/70 ring-1 ring-border">
                      {a.tipo === "video" ? <FileAudio className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{a.conversa}</span>
                      <span className="block truncate text-xs text-muted">
                        {a.from_me ? "Enviado pelo escritório" : a.de !== a.conversa ? `De ${a.de}` : "Recebido"} · {dataLegivel(a.quando)}
                        {a.tipo === "video" ? " · vídeo" : ""}
                      </span>
                    </span>
                    <button type="button" onClick={() => onEscolher(a)} className="ui-btn shrink-0 px-3 py-1.5 text-xs">
                      Escolher
                    </button>
                  </div>
                  {a.url && <audio controls src={a.url} className="mt-2 h-9 w-full" preload="none" />}
                </li>
              ))}
            </ul>
          )}
          {mais && (
            <div className="border-t border-border p-3 text-center">
              <button type="button" onClick={() => void carregarMais()} disabled={carregandoMais} className="ui-btn-secondary px-3 py-1.5 text-xs">
                {carregandoMais && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Ver mais antigos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function melhorFormato(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return undefined;
}

/** Grava pelo microfone (sem limite de tempo); ao parar vira um arquivo. */
function Gravador({ onGravado }: { onGravado: (f: File) => void }) {
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const partes = useRef<Blob[]>([]);

  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function comecar() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return void toast.error("Este navegador não permite gravar áudio.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return void toast.error("Sem acesso ao microfone. Libere a permissão no navegador.");
    }
    streamRef.current = stream;
    const formato = melhorFormato();
    const rec = new MediaRecorder(stream, formato ? { mimeType: formato, audioBitsPerSecond: 48_000 } : undefined);
    partes.current = [];
    rec.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const tipo = rec.mimeType || "audio/webm";
      const ext = tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm";
      const quando = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/[/:]/g, "-").replace(", ", " ");
      onGravado(new File(partes.current, `Gravação ${quando}.${ext}`, { type: tipo.split(";")[0] }));
    };
    rec.start(1000);
    recRef.current = rec;
    setSeg(0);
    setGravando(true);
  }

  function parar() {
    recRef.current?.stop();
    setGravando(false);
  }

  return gravando ? (
    <button type="button" onClick={parar} className="flex min-h-36 flex-col items-center justify-center rounded-2xl bg-status-danger-bg px-6 py-6 text-status-danger sm:w-44">
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-status-danger text-white">
        <Square className="h-4 w-4 fill-current" aria-hidden />
        <span className="absolute inset-0 animate-ping rounded-full bg-status-danger/30 [animation-duration:1.6s]" aria-hidden />
      </span>
      <span className="mt-2 text-lg font-semibold tabular-nums">{mmss(seg)}</span>
      <span className="text-xs">Clique para parar</span>
    </button>
  ) : (
    <button type="button" onClick={() => void comecar()} className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-border px-6 py-6 text-center hover:border-navy hover:bg-surface-2/60 sm:w-44">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy text-white">
        <Mic className="h-5 w-5" aria-hidden />
      </span>
      <span className="mt-2 text-sm font-medium text-foreground">Gravar agora</span>
      <span className="text-xs text-muted">pelo microfone</span>
    </button>
  );
}

/* ───────── andamento ───────── */

function Progresso({ a }: { a: Andamento }) {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeg(Math.floor((Date.now() - a.inicio) / 1000)), 1000);
    return () => clearInterval(t);
  }, [a.inicio]);
  const etapas: { id: Andamento["etapa"]; texto: string }[] = [
    {
      id: "envio",
      texto: a.doZap ? (a.etapa === "envio" ? "Puxando o áudio do WhatsApp…" : "Áudio puxado do WhatsApp") : a.etapa === "envio" ? `Enviando o arquivo… ${a.pct}%` : "Arquivo enviado",
    },
    { id: "preparo", texto: "Preparando o áudio" },
    { id: "ia", texto: "Transcrevendo com IA" },
  ];
  const atual = etapas.findIndex((e) => e.id === a.etapa);
  const estimativa = a.duracao ? Math.max(20, Math.min(240, Math.round(a.duracao / 30))) : null;
  return (
    <section className="ui-card overflow-hidden p-0" role="status" aria-live="polite">
      <div className="flex items-center gap-3 bg-navy-2 px-5 py-4 text-white">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
          <AudioLines className="h-5 w-5 text-gold-2" aria-hidden />
          <span className="absolute inset-0 animate-ping rounded-xl bg-gold/20 [animation-duration:2s]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Transcrevendo{a.duracao ? ` ${duracaoLegivel(a.duracao)} de áudio` : ""}</p>
          <p className="text-xs text-white/60 tabular-nums">
            {a.etapa === "ia" ? `${mmss(seg)}${estimativa ? ` · costuma levar até ${mmss(estimativa)}` : ""}` : "Não feche esta aba enquanto envia."}
          </p>
        </div>
      </div>
      <ol className="space-y-1 px-5 py-5">
        {etapas.map((e, i) => {
          const feita = i < atual;
          const agora = i === atual;
          return (
            <li key={e.id} className={`flex items-center gap-3 text-sm ${agora ? "text-foreground" : feita ? "text-muted" : "text-muted/60"}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${feita ? "bg-status-success text-white" : agora ? "bg-navy text-white" : "bg-surface-2 ring-1 ring-border"}`}>
                {feita ? <Check className="h-3.5 w-3.5" aria-hidden /> : agora ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              </span>
              <span className={agora ? "font-medium" : ""}>{e.texto}</span>
            </li>
          );
        })}
      </ol>
      {a.etapa === "envio" && !a.doZap && (
        <div className="mx-5 mb-5 h-1.5 overflow-hidden rounded-full bg-track">
          <div className="h-full rounded-full bg-navy transition-[width] duration-300" style={{ width: `${a.pct}%` }} />
        </div>
      )}
      {a.etapa === "ia" && <p className="px-5 pb-5 text-xs text-muted">Depois que o arquivo foi enviado, a transcrição continua no servidor mesmo se você sair desta tela. Ela aparece pronta no histórico.</p>}
    </section>
  );
}

/* ───────── resultado ───────── */

function Resultado({
  t,
  mostrarDono,
  onNova,
  onMudou,
  onExcluida,
  onTentarDeNovo,
}: {
  t: Transcricao;
  mostrarDono: boolean;
  onNova: () => void;
  onMudou: (campos: { titulo?: string; texto?: string; resumo?: string }) => void;
  onExcluida: () => void;
  onTentarDeNovo: () => void;
}) {
  const [aba, setAba] = useState<"texto" | "resumo">(t.texto ? "texto" : "resumo");
  const [titulo, setTitulo] = useState(t.titulo);
  const [texto, setTexto] = useState(t.texto ?? "");
  const [resumo, setResumo] = useState(t.resumo ?? "");
  const [salvo, setSalvo] = useState<"salvo" | "salvando" | "pendente">("salvo");
  const [parte, setParte] = useState<ParteExport>("ambos");
  const [instrucao, setInstrucao] = useState(t.opcoes?.instrucao ?? "");
  const [resumindo, setResumindo] = useState(false);
  const [docs, setDocs] = useState(false);
  const pendente = useRef<{ titulo?: string; texto?: string; resumo?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const salvarAgora = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const campos = pendente.current;
    if (!Object.keys(campos).length) return true;
    pendente.current = {};
    setSalvo("salvando");
    const r = await salvarTranscricaoAction(t.id, campos);
    if (!r.ok) {
      pendente.current = { ...campos, ...pendente.current };
      setSalvo("pendente");
      toast.error(r.erro ?? "Não foi possível salvar.");
      return false;
    }
    onMudou(campos);
    setSalvo(Object.keys(pendente.current).length ? "pendente" : "salvo");
    return true;
  }, [t.id, onMudou]);

  function mudar(campo: "titulo" | "texto" | "resumo", valor: string) {
    if (campo === "titulo") setTitulo(valor);
    if (campo === "texto") setTexto(valor);
    if (campo === "resumo") setResumo(valor);
    pendente.current[campo] = valor;
    setSalvo("pendente");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvarAgora(), 1200);
  }

  // salva o que faltou ao sair da transcrição
  useEffect(
    () => () => {
      if (Object.keys(pendente.current).length) void salvarTranscricaoAction(t.id, pendente.current);
    },
    [t.id]
  );

  const temOsDois = !!texto.trim() && !!resumo.trim();
  const parteEfetiva: ParteExport = temOsDois ? parte : texto.trim() ? "texto" : "resumo";
  const dados = { titulo, created_at: t.created_at, duracao_seg: t.duracao_seg, arquivo_nome: t.arquivo_nome, texto, resumo };
  const atual = aba === "texto" ? texto : resumo;
  const palavras = atual.trim() ? atual.trim().split(/\s+/).length : 0;

  async function baixar(formato: "txt" | "pdf" | "docx") {
    if (!(await salvarAgora())) return;
    if (formato === "txt") {
      const blob = new Blob([textoDoDocumento(dados, parteEfetiva)], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nomeDeArquivo(titulo, "txt");
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return;
    }
    const a = document.createElement("a");
    a.href = `/api/transcricao/${t.id}/arquivo?formato=${formato}&parte=${parteEfetiva}`;
    a.download = nomeDeArquivo(titulo, formato);
    a.click();
  }

  async function googleDocs() {
    if (!(await salvarAgora())) return;
    // abre a aba já (o navegador bloqueia popup aberto depois de esperar)
    const janela = window.open("about:blank", "_blank");
    setDocs(true);
    const r = await abrirNoGoogleDocsAction(t.id, parteEfetiva);
    setDocs(false);
    if (!r.ok) {
      janela?.close();
      return void toast.error(r.erro);
    }
    if (janela) janela.location.href = r.url;
    else window.open(r.url, "_blank");
    toast.success("Google Docs criado na pasta Transcrições do Drive.");
  }

  async function gerarResumo() {
    if (!(await salvarAgora())) return;
    setResumindo(true);
    const r = await gerarResumoAction(t.id, instrucao);
    setResumindo(false);
    if (!r.ok) return void toast.error(r.erro);
    setResumo(r.resumo);
    onMudou({ resumo: r.resumo });
    setAba("resumo");
    toast.success("Resumo pronto.");
  }

  async function excluir() {
    if (!confirm(`Excluir "${titulo}"? O texto some do histórico.`)) return;
    const r = await excluirTranscricaoAction(t.id);
    if (!r.ok) return void toast.error(r.erro ?? "Não foi possível excluir.");
    toast.success("Transcrição excluída.");
    onExcluida();
  }

  const meta = [dataLegivel(t.created_at), t.duracao_seg ? duracaoLegivel(t.duracao_seg) : null, MODO_ROTULO[t.modo], mostrarDono && t.dono ? `de ${t.dono}` : null].filter(Boolean).join(" · ");

  if (t.status !== "pronta") {
    return (
      <section className="ui-card p-6">
        <p className="eyebrow">{meta}</p>
        <h2 className="section-title mt-1">{t.titulo}</h2>
        {t.status === "erro" ? (
          <div className="mt-4 rounded-xl bg-status-danger-bg p-4 text-sm text-status-danger">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Não deu para transcrever
            </p>
            <p className="mt-1 text-foreground/80">{t.erro ?? "Erro desconhecido."}</p>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Transcrevendo no servidor… esta tela atualiza sozinha.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {t.status === "erro" && (
            <button type="button" onClick={onTentarDeNovo} className="ui-btn">
              <RotateCcw className="h-4 w-4" aria-hidden /> Tentar de novo
            </button>
          )}
          <button type="button" onClick={onNova} className="ui-btn-secondary">
            <Plus className="h-4 w-4" aria-hidden /> Nova transcrição
          </button>
          <button type="button" onClick={() => void excluir()} className="ui-btn-secondary text-status-danger">
            <Trash2 className="h-4 w-4" aria-hidden /> Excluir
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="ui-card overflow-hidden p-0">
      <div className="border-b border-border px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{meta}</p>
            <input
              value={titulo}
              onChange={(e) => mudar("titulo", e.target.value)}
              maxLength={140}
              aria-label="Título"
              className="mt-1 w-full rounded-lg bg-transparent px-1 -mx-1 font-display text-xl font-bold text-foreground outline-none hover:bg-surface-2 focus:bg-surface-2"
            />
          </div>
          <span className="mt-1 shrink-0 text-[11px] text-muted" aria-live="polite">
            {salvo === "salvando" ? "Salvando…" : salvo === "pendente" ? "Editando…" : "Salvo"}
          </span>
        </div>

        {/* abas */}
        <div className="mt-4 flex items-center gap-1.5 text-sm">
          {(["texto", "resumo"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAba(a)}
              className={`rounded-full px-3.5 py-1.5 font-medium ${aba === a ? "bg-navy text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}
            >
              {a === "texto" ? "Transcrição fiel" : "Resumo com IA"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4">
        {aba === "resumo" && !resumo.trim() ? (
          <div className="rounded-2xl border border-dashed border-border-strong p-6 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-muted" aria-hidden />
            <p className="mt-2 text-sm font-medium text-foreground">Gerar o resumo desta transcrição</p>
            <p className="mt-0.5 text-xs text-muted">Pontos principais, decisões, próximos passos e o que foi citado.</p>
            <textarea value={instrucao} onChange={(e) => setInstrucao(e.target.value)} maxLength={600} rows={2} placeholder="Instrução (opcional): ex.: foque nos prazos" className="ui-input mx-auto mt-4 max-w-lg resize-y text-left" />
            <button type="button" onClick={() => void gerarResumo()} disabled={resumindo} className="ui-btn mt-3">
              {resumindo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Gerar resumo
            </button>
          </div>
        ) : aba === "texto" && !texto.trim() ? (
          <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-sm text-muted">Esta transcrição foi feita só com resumo. Para ter o texto palavra por palavra, faça uma nova escolhendo &quot;Transcrição fiel&quot;.</p>
        ) : (
          <>
            <textarea
              value={atual}
              onChange={(e) => mudar(aba, e.target.value)}
              aria-label={aba === "texto" ? "Transcrição" : "Resumo"}
              spellCheck
              className="ui-input min-h-[55vh] w-full resize-y font-[inherit] text-[15px] leading-relaxed"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="tabular-nums">
                {palavras.toLocaleString("pt-BR")} palavras · {atual.length.toLocaleString("pt-BR")} caracteres
              </span>
              {aba === "resumo" && texto.trim() && (
                <span className="flex items-center gap-2">
                  <input value={instrucao} onChange={(e) => setInstrucao(e.target.value)} maxLength={600} placeholder="Nova instrução (opcional)" className="ui-input !w-56 !py-1 text-xs" aria-label="Instrução para refazer o resumo" />
                  <button type="button" onClick={() => void gerarResumo()} disabled={resumindo} className="ui-btn-secondary px-2.5 py-1 text-xs">
                    {resumindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Refazer resumo
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ações */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/40 px-5 py-3">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(atual).then(() => toast.success("Copiado."));
          }}
          disabled={!atual.trim()}
          className="ui-btn-secondary px-3 py-1.5 text-sm"
        >
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
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={onNova} className="ui-btn-secondary px-3 py-1.5 text-sm">
            <Plus className="h-4 w-4" aria-hidden /> Nova
          </button>
          <button type="button" onClick={() => void excluir()} className="icon-btn h-9 w-9 text-status-danger" aria-label="Excluir transcrição" data-tip="Excluir">
            <Trash2 aria-hidden />
          </button>
        </span>
      </div>
    </section>
  );
}

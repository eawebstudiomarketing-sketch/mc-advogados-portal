"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, Mic, MonitorUp, Plus, Square, Star, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { TIPOS_ATA, type Marcacao, type Participante, type TipoAta } from "@/lib/atas/formato";
import { useTopoAoTrocar } from "@/lib/use-topo";
import { contatosDoClienteAction, criarAtaAction, finalizarGravacaoAction, linkDeEnvioAction, salvarMarcacoesAction } from "../actions";
import { apagarPedaco, apagarPedacos, guardarPedaco } from "@/lib/atas/copia-local";

type Membro = { profileId: string; nome: string; telefone: string | null; email: string | null };
type Pessoa = { nome: string; cargo: string; telefone: string; email: string; papel: "cliente" | "testemunha" | "outro" };
type Modo = "presencial" | "online" | "arquivo";

const PEDACO_MS = 15_000; // 11/11/2026: era 30 s; menos a perder se a aba fechar
const PROGRAMAS = ["Google Meet", "Zoom", "Microsoft Teams", "WhatsApp", "Outro"];
const AVISO = "Pessoal, só um aviso: esta reunião vai ser gravada e transcrita. Se for preciso, depois é feita uma ata e enviada para todos conferirem e assinarem. Tudo bem?";
const mmss = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const vazia = (): Pessoa => ({ nome: "", cargo: "", telefone: "", email: "", papel: "cliente" });

function melhorFormato(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return undefined;
}

export function NovaAta({ clientes, equipe, meuProfileId, clienteInicial }: { clientes: { id: string; name: string }[]; equipe: Membro[]; meuProfileId: string; clienteInicial: string | null }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoAta>("reuniao_cliente");
  const [clienteId, setClienteId] = useState(clienteInicial ?? "");
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(agoraLocal);
  const [onde, setOnde] = useState<"presencial" | "online">("presencial");
  const [programa, setPrograma] = useState("Google Meet");
  const [pauta, setPauta] = useState("");
  const [daEquipe, setDaEquipe] = useState<string[]>([meuProfileId]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [contatos, setContatos] = useState<{ telefones: string[]; email: string | null } | null>(null);
  const [modo, setModo] = useState<Modo>("presencial");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [comecando, setComecando] = useState(false);
  const [gravacao, setGravacao] = useState<Gravacao | null>(null);
  const [envioArquivo, setEnvioArquivo] = useState<number | null>(null);
  useTopoAoTrocar(!!gravacao);

  // contatos do cliente escolhido (para sugerir WhatsApp/e-mail de quem assina)
  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    void contatosDoClienteAction(clienteId).then((c) => vivo && setContatos(c));
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  const participantes = (): Participante[] => [
    ...equipe.filter((m) => daEquipe.includes(m.profileId)).map((m) => ({ nome: m.nome, papel: "escritorio" as const, profile_id: m.profileId, telefone: m.telefone, email: m.email })),
    ...pessoas.filter((p) => p.nome.trim()).map((p) => ({ nome: p.nome, papel: p.papel, cargo: p.cargo, telefone: p.telefone, email: p.email })),
  ];

  async function criar(origem: "gravacao" | "arquivo") {
    return criarAtaAction({
      tipo,
      titulo: titulo || TIPOS_ATA[tipo].rotulo,
      clientId: clienteId || null,
      dataReuniao: new Date(data).toISOString(),
      local: onde === "presencial" ? "Presencial" : `Online (${programa})`,
      pauta,
      participantes: participantes(),
      origem,
      arquivoNome: arquivo?.name,
    });
  }

  async function gravar() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return void toast.error("Este navegador não grava áudio. Use o Chrome ou o Edge no computador.");
    setComecando(true);
    const streams: MediaStream[] = [];
    try {
      let tela: MediaStream | null = null;
      if (modo === "online") {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error("Este navegador não capta o som da reunião. Use o Chrome ou o Edge no computador.");
        // o navegador pede para escolher a aba/tela e marcar "compartilhar áudio"
        tela = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, systemAudio: "include", selfBrowserSurface: "exclude" } as DisplayMediaStreamOptions);
        streams.push(tela);
        if (!tela.getAudioTracks().length) throw new Error('Faltou marcar "Compartilhar áudio" ao escolher a aba ou a tela. Tente de novo.');
      }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streams.push(mic);
      let fonte: MediaStream = mic;
      if (tela) {
        // mistura microfone + som da reunião numa trilha só
        const ctx = new AudioContext();
        const destino = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(mic).connect(destino);
        ctx.createMediaStreamSource(new MediaStream(tela.getAudioTracks())).connect(destino);
        fonte = destino.stream;
      }
      const c = await criar("gravacao");
      if (!c.ok) throw new Error(c.erro);
      const formato = melhorFormato();
      const recorder = new MediaRecorder(fonte, formato ? { mimeType: formato, audioBitsPerSecond: 32_000 } : undefined);
      // cada pedaço: numerado, guardado neste navegador (IndexedDB) e posto na fila de envio.
      // Fica fora da tela de gravação de propósito: se ela sair do ar, o pedaço continua salvo aqui.
      const fila: Gravacao["fila"] = { itens: [], contador: 0 };
      recorder.addEventListener("dataavailable", (e) => {
        if (!e.data.size) return;
        const n = fila.contador++;
        fila.itens.push({ n, blob: e.data });
        void guardarPedaco(c.id, n, e.data);
      });
      setGravacao({ ataId: c.id, inicio: Date.now(), recorder, streams, online: !!tela, fila });
      enviador.current = { base: c.envio, ataId: c.id };
      recorder.start(PEDACO_MS);
    } catch (e) {
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      const msg = e instanceof Error ? e.message : "";
      toast.error(/Permission|NotAllowed/i.test(msg) || (e as { name?: string })?.name === "NotAllowedError" ? "Sem permissão para gravar. Libere o microfone (e o compartilhamento) no navegador." : msg || "Não foi possível começar a gravar.");
    } finally {
      setComecando(false);
    }
  }

  async function enviarArquivo() {
    if (!arquivo) return;
    setComecando(true);
    try {
      const c = await criar("arquivo");
      if (!c.ok) throw new Error(c.erro);
      setEnvioArquivo(0);
      const r = await new Promise<{ ok: boolean; duracao?: number; erro?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", c.envio);
        xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => e.lengthComputable && setEnvioArquivo(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({ ok: false, erro: `O servidor respondeu ${xhr.status}.` });
          }
        };
        xhr.onerror = () => resolve({ ok: false, erro: "Falha de conexão ao enviar o arquivo." });
        xhr.send(arquivo);
      });
      if (!r.ok) throw new Error(r.erro ?? "Não foi possível enviar o arquivo.");
      const f = await finalizarGravacaoAction(c.id, { duracao: r.duracao, pedacos: false });
      if (!f.ok) throw new Error(f.erro);
      await fetch(`/api/atas/${c.id}/gerar`, { method: "POST" });
      router.push(`/admin/atas/${c.id}`);
    } catch (e) {
      setEnvioArquivo(null);
      toast.error(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setComecando(false);
    }
  }

  const enviador = useRef<{ base: string; ataId: string } | null>(null);

  if (gravacao) return <Gravando g={gravacao} enviador={enviador} onFim={(id) => router.push(`/admin/atas/${id}`)} />;

  const cliente = clientes.find((c) => c.id === clienteId);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <section className="ui-card p-5 sm:p-6">
          <h2 className="section-title">Reunião</h2>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium text-foreground">Tipo</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(TIPOS_ATA) as TipoAta[]).map((t) => {
                const on = tipo === t;
                return (
                  <label key={t} className={`cursor-pointer rounded-xl border p-3 transition-colors ${on ? "border-navy bg-surface-2 ring-1 ring-navy" : "border-border hover:border-border-strong"}`}>
                    <input type="radio" name="tipo" checked={on} onChange={() => setTipo(t)} className="sr-only" />
                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {TIPOS_ATA[t].rotulo}
                      {on && <Check className="ml-auto h-4 w-4 text-status-success" aria-hidden />}
                    </span>
                    <span className="mt-1 block text-xs text-muted">{TIPOS_ATA[t].descricao}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">Cliente</span>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="ui-input">
                <option value="">{tipo === "interna" ? "Nenhum (reunião interna)" : "Escolha o cliente"}</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">Data e hora</span>
              <input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} className="ui-input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">Título</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={TIPOS_ATA[tipo].rotulo} maxLength={160} className="ui-input" />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-foreground">Local</span>
              <div className="flex gap-2">
                <select value={onde} onChange={(e) => setOnde(e.target.value as "presencial" | "online")} className="ui-input">
                  <option value="presencial">Presencial</option>
                  <option value="online">Online</option>
                </select>
                {onde === "online" && (
                  <select value={programa} onChange={(e) => setPrograma(e.target.value)} className="ui-input" aria-label="Programa">
                    {PROGRAMAS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Pauta <span className="font-normal text-muted">(opcional)</span>
            </span>
            <textarea value={pauta} onChange={(e) => setPauta(e.target.value)} rows={2} maxLength={2000} placeholder="Ex.: andamento dos processos trabalhistas; documentos pendentes" className="ui-input resize-y" />
          </label>
        </section>

        <section className="ui-card p-5 sm:p-6">
          <h2 className="section-title">Participantes</h2>
          <p className="mt-1 text-sm text-muted">Os nomes ajudam a IA a saber quem falou. Quem é de fora recebe o link de assinatura pelo WhatsApp ou e-mail.</p>
          <p className="mt-4 mb-2 text-sm font-medium text-foreground">Do escritório</p>
          <div className="flex flex-wrap gap-2">
            {equipe.map((m) => {
              const on = daEquipe.includes(m.profileId);
              return (
                <button
                  key={m.profileId}
                  type="button"
                  onClick={() => setDaEquipe((l) => (on ? l.filter((x) => x !== m.profileId) : [...l, m.profileId]))}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 transition-colors ${on ? "bg-navy text-white ring-navy" : "text-foreground ring-border hover:ring-border-strong"}`}
                  aria-pressed={on}
                >
                  {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {m.nome}
                </button>
              );
            })}
          </div>

          <p className="mt-5 mb-2 text-sm font-medium text-foreground">{tipo === "interna" ? "Convidados" : `Do cliente${cliente ? ` (${cliente.name})` : ""} e convidados`}</p>
          <div className="space-y-3">
            {pessoas.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1.3fr_0.9fr_0.9fr_1fr_1.2fr_auto]">
                <input value={p.nome} onChange={(e) => setPessoas((l) => l.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} placeholder="Nome" aria-label="Nome" className="ui-input" />
                <input value={p.cargo} onChange={(e) => setPessoas((l) => l.map((x, j) => (j === i ? { ...x, cargo: e.target.value } : x)))} placeholder="Cargo (ex.: CEO)" aria-label="Cargo" className="ui-input" />
                <select value={p.papel} onChange={(e) => setPessoas((l) => l.map((x, j) => (j === i ? { ...x, papel: e.target.value as Pessoa["papel"] } : x)))} aria-label="Papel" className="ui-input">
                  <option value="cliente">Cliente</option>
                  <option value="testemunha">Testemunha</option>
                  <option value="outro">Convidado</option>
                </select>
                <input value={p.telefone} onChange={(e) => setPessoas((l) => l.map((x, j) => (j === i ? { ...x, telefone: e.target.value } : x)))} placeholder="WhatsApp com DDD" aria-label="WhatsApp" inputMode="tel" className="ui-input" />
                <input value={p.email} onChange={(e) => setPessoas((l) => l.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="E-mail" aria-label="E-mail" inputMode="email" className="ui-input" />
                <button type="button" onClick={() => setPessoas((l) => l.filter((_, j) => j !== i))} className="icon-btn h-9 w-9 self-center" aria-label="Tirar pessoa" data-tip="Tirar">
                  <X aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPessoas((l) => [...l, { ...vazia(), papel: tipo === "interna" ? "outro" : "cliente" }])} className="ui-btn-secondary px-3 py-1.5 text-sm">
              <Plus className="h-4 w-4" aria-hidden /> Adicionar pessoa
            </button>
            {clienteId && contatos && (contatos.telefones.length > 0 || contatos.email) && (
              <span className="text-xs text-muted">
                Contatos do cadastro:{" "}
                {[...contatos.telefones.slice(0, 3), ...(contatos.email ? [contatos.email] : [])].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setPessoas((l) => {
                        const campo = c.includes("@") ? "email" : "telefone";
                        const alvo = l.findIndex((x) => !x[campo]);
                        if (alvo >= 0) return l.map((x, j) => (j === alvo ? { ...x, [campo]: c } : x));
                        return [...l, { ...vazia(), [campo]: c }];
                      })
                    }
                    className="mr-1 underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    {c.includes("@") ? c : `(${c.slice(2, 4)}) ${c.slice(4, -4)}-${c.slice(-4)}`}
                  </button>
                ))}
              </span>
            )}
          </div>
        </section>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
        <section className="ui-card p-5">
          <h2 className="section-title !text-base">Gravação</h2>
          <div className="mt-3 space-y-2">
            {(
              [
                { id: "presencial", icone: Mic, titulo: "Presencial", texto: "Grava pelo microfone do computador." },
                { id: "online", icone: MonitorUp, titulo: "Reunião online", texto: "Microfone + som da reunião (Meet, Zoom, Teams). O navegador pede para escolher a aba ou a tela." },
                { id: "arquivo", icone: Upload, titulo: "Já tenho o áudio", texto: "Envie a gravação (áudio ou vídeo, até 1 GB)." },
              ] as const
            ).map((m) => {
              const on = modo === m.id;
              return (
                <label key={m.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${on ? "border-navy bg-surface-2 ring-1 ring-navy" : "border-border hover:border-border-strong"}`}>
                  <input type="radio" name="modo" checked={on} onChange={() => setModo(m.id)} className="sr-only" />
                  <m.icone className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{m.titulo}</span>
                    <span className="block text-xs text-muted">{m.texto}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {modo === "online" && (
            <p className="mt-3 rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              <b className="text-foreground">Meet no navegador:</b> escolha a <b>aba</b> da reunião e deixe <b>“Compartilhar áudio da guia”</b> ligado.
              <br />
              <b className="text-foreground">Zoom/Teams pelo aplicativo:</b> escolha <b>“Tela inteira”</b> e ligue <b>“Compartilhar áudio do sistema”</b>.
            </p>
          )}

          {modo === "arquivo" ? (
            <div className="mt-4">
              <input type="file" accept="audio/*,video/*,.ogg,.opus,.m4a,.mp3,.wav,.mp4,.mov,.webm" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="block w-full text-sm" aria-label="Arquivo de áudio" />
              <button type="button" onClick={() => void enviarArquivo()} disabled={!arquivo || comecando} className="ui-btn mt-3 w-full justify-center">
                {comecando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                {envioArquivo !== null ? `Enviando… ${envioArquivo}%` : "Enviar e transcrever"}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-foreground">Antes de começar, avise que vai gravar:</p>
                <p className="mt-1 text-xs text-muted italic">“{AVISO}”</p>
                <button type="button" onClick={() => void navigator.clipboard.writeText(AVISO).then(() => toast.success("Copiado."))} className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
                  <Copy className="h-3 w-3" aria-hidden /> Copiar o aviso
                </button>
              </div>
              <button type="button" onClick={() => void gravar()} disabled={comecando} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-status-danger px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {comecando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <span className="h-2.5 w-2.5 rounded-full bg-white" aria-hidden />} Começar a gravar
              </button>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}

/* ───────── gravando ───────── */

type Gravacao = {
  ataId: string;
  inicio: number;
  recorder: MediaRecorder;
  streams: MediaStream[];
  online: boolean;
  fila: { itens: { n: number; blob: Blob }[]; contador: number };
};

function Gravando({
  g,
  enviador,
  onFim,
}: {
  g: Gravacao;
  enviador: React.RefObject<{ base: string; ataId: string } | null>;
  onFim: (id: string) => void;
}) {
  const [seg, setSeg] = useState(0);
  const [salvoAte, setSalvoAte] = useState(0);
  const [pendentes, setPendentes] = useState(0);
  const [semConexao, setSemConexao] = useState(false);
  const [marcacoes, setMarcacoes] = useState<Marcacao[]>([]);
  const [encerrando, setEncerrando] = useState<string | null>(null);
  const [telaCaiu, setTelaCaiu] = useState(false);
  const fila = useRef(g.fila.itens);
  const montada = useRef(false);
  const ocupado = useRef(false);

  // relógio (em segundo plano o navegador atualiza mais devagar; a gravação não para)
  useEffect(() => {
    const t = setInterval(() => setSeg(Math.floor((Date.now() - g.inicio) / 1000)), 1000);
    return () => clearInterval(t);
  }, [g.inicio]);

  // não deixa a tela apagar enquanto a aba estiver aberta na frente
  useEffect(() => {
    let trava: { release: () => Promise<void> } | null = null;
    const pedir = () => void (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").then((w) => (trava = w)).catch(() => {});
    pedir();
    const voltar = () => document.visibilityState === "visible" && pedir();
    document.addEventListener("visibilitychange", voltar);
    return () => {
      document.removeEventListener("visibilitychange", voltar);
      void trava?.release().catch(() => {});
    };
  }, []);

  // aviso ao fechar a aba
  useEffect(() => {
    const segura = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", segura);
    return () => window.removeEventListener("beforeunload", segura);
  }, []);

  // 11/11/2026: clicar em outra tela do portal tirava esta tela do ar sem aviso (o aviso do
  // navegador só vale para fechar a aba). Agora pergunta antes; e, se sair, a gravação para
  // e o que foi gravado fica guardado neste computador para recuperar na página da reunião.
  useEffect(() => {
    const clique = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.getAttribute("href")?.startsWith("#") || e.ctrlKey || e.metaKey) return;
      if (!confirm("A gravação está em andamento. Se sair desta tela, ela para (o que já foi gravado fica salvo).\n\nPara terminar a reunião, use “Encerrar e transcrever”.\n\nSair mesmo assim?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", clique, true);
    montada.current = true;
    return () => {
      document.removeEventListener("click", clique, true);
      montada.current = false;
      // espera um instante: no modo de desenvolvimento o React desmonta e remonta na hora
      setTimeout(() => {
        if (montada.current) return;
        if (g.recorder.state !== "inactive") g.recorder.stop();
        g.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      }, 500);
    };
  }, [g]);

  useEffect(() => {
    const tela = g.streams.find((s) => s.getVideoTracks().length);
    const fim = () => setTelaCaiu(true);
    tela?.getTracks().forEach((t) => t.addEventListener("ended", fim));
    return () => tela?.getTracks().forEach((t) => t.removeEventListener("ended", fim));
  }, [g.streams]);

  async function bombear() {
    if (ocupado.current) return;
    ocupado.current = true;
    let espera = 2000;
    try {
      while (fila.current.length) {
        const p = fila.current[0];
        const e = enviador.current!;
        let ok = false;
        try {
          // 11/11/2026: sem limite de tempo, um envio travado segurava a fila inteira em silêncio
          const r = await fetch(e.base.replace("?", `/parte/${p.n}?`), { method: "PUT", body: p.blob, signal: AbortSignal.timeout(60_000) });
          if (r.status === 403) {
            const novo = await linkDeEnvioAction(e.ataId);
            if (novo) enviador.current = { ...e, base: novo };
          }
          ok = r.ok;
        } catch {
          ok = false;
        }
        if (ok) {
          fila.current.shift();
          void apagarPedaco(g.ataId, p.n);
          setSalvoAte((p.n + 1) * (PEDACO_MS / 1000));
          setPendentes(fila.current.length);
          setSemConexao(false);
          espera = 2000;
        } else {
          setSemConexao(true);
          await new Promise((r) => setTimeout(r, espera));
          espera = Math.min(espera * 2, 30_000);
        }
      }
    } finally {
      ocupado.current = false;
    }
  }

  useEffect(() => {
    const chegou = () => {
      setPendentes(fila.current.length);
      void bombear();
    };
    g.recorder.addEventListener("dataavailable", chegou);
    return () => g.recorder.removeEventListener("dataavailable", chegou);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bombear usa só refs
  }, [g.recorder]);

  function marcar(tipo: Marcacao["tipo"]) {
    const nova = [...marcacoes, { seg: Math.floor((Date.now() - g.inicio) / 1000), tipo }];
    setMarcacoes(nova);
    void salvarMarcacoesAction(g.ataId, nova);
    toast.success(tipo === "decisao" ? "Decisão marcada." : "Momento marcado.");
  }

  async function encerrar() {
    if (!confirm("Encerrar a gravação e transcrever a reunião?")) return;
    setEncerrando("Salvando o final da gravação…");
    await new Promise<void>((ok) => {
      g.recorder.addEventListener("stop", () => ok(), { once: true });
      g.recorder.stop();
    });
    g.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    // espera os pedaços que faltam subir (até 3 min)
    const limite = Date.now() + 180_000;
    while ((fila.current.length || ocupado.current) && Date.now() < limite) {
      void bombear();
      await new Promise((r) => setTimeout(r, 500));
    }
    if (fila.current.length) {
      setEncerrando(null);
      return void toast.error("Ainda há partes da gravação sem enviar (sem internet?). Mantenha a aba aberta e tente encerrar de novo.");
    }
    await salvarMarcacoesAction(g.ataId, marcacoes);
    setEncerrando("Juntando a gravação…");
    const f = await finalizarGravacaoAction(g.ataId, { pedacos: true });
    if (!f.ok) {
      setEncerrando(null);
      return void toast.error(f.erro);
    }
    void apagarPedacos(g.ataId);
    setEncerrando("Transcrevendo…");
    await fetch(`/api/atas/${g.ataId}/gerar`, { method: "POST" }).catch(() => {});
    onFim(g.ataId);
  }

  const decisoes = marcacoes.filter((m) => m.tipo === "decisao").length;
  return (
    <section className="ui-card mx-auto max-w-2xl overflow-hidden p-0" aria-live="polite">
      <div className="flex flex-col items-center bg-navy-2 px-6 py-10 text-white">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-status-danger">
          <Mic className="h-7 w-7" aria-hidden />
          {!encerrando && <span className="absolute inset-0 animate-ping rounded-full bg-status-danger/40 [animation-duration:1.8s]" aria-hidden />}
        </span>
        <p className="mt-4 font-mono text-4xl font-semibold tabular-nums">{mmss(seg)}</p>
        <p className="mt-1 text-sm text-white/70">{encerrando ?? (g.online ? "Gravando microfone + som da reunião" : "Gravando pelo microfone")}</p>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm text-muted">
          {/* envio parado (3+ pedaços na fila) também avisa */}
          {semConexao || pendentes >= 3 ? (
            <>
              <AlertTriangle className="h-4 w-4 text-status-danger" aria-hidden /> Sem conexão com o servidor: a gravação continua, guardada neste computador, e os pedaços sobem quando a internet voltar ({pendentes} na fila).
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden /> Salvo no servidor até {mmss(salvoAte)}
              {pendentes ? ` · enviando ${pendentes}` : ""}. Pode trocar de aba ou minimizar.
            </>
          )}
        </p>
        {telaCaiu && (
          <p className="flex items-start gap-2 rounded-lg bg-status-danger-bg p-3 text-sm text-status-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> O compartilhamento da reunião parou: daqui pra frente só o microfone está sendo gravado.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!encerrando} onClick={() => marcar("importante")} className="ui-btn-secondary">
            <Star className="h-4 w-4" aria-hidden /> Importante
          </button>
          <button type="button" disabled={!!encerrando} onClick={() => marcar("decisao")} className="ui-btn-secondary">
            <Check className="h-4 w-4" aria-hidden /> Decisão{decisoes ? ` (${decisoes})` : ""}
          </button>
          <button type="button" disabled={!!encerrando} onClick={() => void encerrar()} className="ui-btn ml-auto">
            {encerrando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Square className="h-4 w-4 fill-current" aria-hidden />} Encerrar e transcrever
          </button>
        </div>
        <p className="text-xs text-muted">Marque os momentos importantes e as decisões: eles entram com prioridade na ata, se você gerar uma. Não feche esta aba nem troque de tela no portal até encerrar.</p>
      </div>
    </section>
  );
}

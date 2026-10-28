"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, Copy, Download, Eye, FileText, Loader2, Mail, MapPin, MessageCircle, Pencil, RotateCcw, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AtaDocumento } from "@/components/atas/ata-documento";
import { AssinaturaPad, type AssinaturaFeita } from "@/components/atas/assinatura-pad";
import { ReuniaoEntrega } from "./reuniao-entrega";
import {
  blocosDaAta,
  blocosParaCliente,
  dataHoraBr,
  PAPEL_ROTULO,
  segundos,
  STATUS_ROTULO,
  temParteInterna,
  TIPOS_ATA,
  type Alerta,
  type Participante,
  type StatusAta,
  type TipoAta,
} from "@/lib/atas/formato";
import {
  aprovarAtaAction,
  arquivosDaAssinaturaAction,
  cancelarAssinaturasAction,
  linkDeAssinaturaAction,
  sincronizarZapsignAction,
  excluirAtaAction,
  finalizarGravacaoAction,
  reenviarAssinaturaAction,
  salvarAtaAction,
  type AssinaturaLinha,
} from "../actions";

type Ata = {
  id: string;
  tipo: TipoAta;
  titulo: string;
  data_reuniao: string;
  local: string | null;
  pauta: string | null;
  participantes: Participante[];
  status: StatusAta;
  erro: string | null;
  texto: string | null;
  alertas: Alerta[];
  versao: number;
  correcao: string | null;
  cliente: string | null;
  criadaEm: string;
  transcricaoId: string | null;
  temFinal: boolean;
  hash: string | null;
  codigo: string | null;
  ordemAssinatura: boolean;
  via: "portal" | "zapsign";
  carimbo: { quando: string; tsa: string } | null;
  selado: boolean;
};
type ZapsignInfo = { ok: boolean; sandbox: boolean };

export function AtaDetalhe({
  ata,
  transcricao,
  resumo,
  duracao,
  audio,
  assinaturas,
  meuNome,
  zapsign,
}: {
  ata: Ata;
  transcricao: string | null;
  resumo: string | null;
  duracao: number | null;
  audio: string | null;
  assinaturas: AssinaturaLinha[];
  meuNome: string;
  zapsign: ZapsignInfo;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(ata.texto ?? "");
  const [titulo, setTitulo] = useState(ata.titulo);
  const [participantes, setParticipantes] = useState<Participante[]>(ata.participantes);
  const [aba, setAba] = useState<"ver" | "editar" | "transcricao" | "resumo">("ver");
  const [salvo, setSalvo] = useState<"salvo" | "editando" | "salvando">("salvo");
  const [aprovando, setAprovando] = useState(false);
  const [editandoDados, setEditandoDados] = useState(false);
  const player = useRef<HTMLAudioElement>(null);
  const rascunho = ata.status === "rascunho";
  const reuniao = ata.status === "transcrita" || ata.status === "gerando";
  const editavel = rascunho || ata.status === "transcrita";

  // geração em andamento: confere a cada 5 s
  useEffect(() => {
    if (ata.status !== "processando" && ata.status !== "gerando") return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [ata.status, router]);

  // salva sozinho 1,2 s depois de parar de digitar
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (!editavel) return;
    const t = setTimeout(async () => {
      setSalvo("salvando");
      const r = await salvarAtaAction(ata.id, rascunho ? { texto, titulo, participantes } : { titulo, participantes });
      if (!r.ok) toast.error(r.erro ?? "Não foi possível salvar.");
      setSalvo("salvo");
    }, 1200);
    return () => clearTimeout(t);
  }, [texto, titulo, participantes, rascunho, editavel, ata.id]);

  const mudou = <T,>(f: (v: T) => void) => (v: T) => {
    setSalvo("editando");
    f(v);
  };

  const dados = { tipo: ata.tipo, titulo, data_reuniao: ata.data_reuniao, local: ata.local, pauta: ata.pauta, participantes, cliente: ata.cliente };
  const blocos = useMemo(() => blocosDaAta(texto), [texto]);
  const interna = temParteInterna(texto);

  function tocar(hms: string) {
    const a = player.current;
    if (!a) return void toast("A gravação não está mais disponível (é apagada ao aprovar).");
    a.currentTime = Math.max(0, segundos(hms) - 2);
    void a.play();
  }

  async function tentarDeNovo(fecharGravacao: boolean) {
    if (fecharGravacao) {
      const f = await finalizarGravacaoAction(ata.id, { pedacos: true });
      if (!f.ok) return void toast.error(f.erro);
    }
    const r = await fetch(`/api/atas/${ata.id}/gerar`, { method: "POST" });
    if (!r.ok) toast.error((await r.json().catch(() => ({}))).error ?? "Não deu certo.");
    router.refresh();
  }

  async function excluir() {
    if (!confirm("Excluir esta reunião (com a transcrição, o resumo e a ata, se houver) e a gravação? Não dá para desfazer.")) return;
    const r = await excluirAtaAction(ata.id);
    if (!r.ok) return void toast.error(r.erro);
    toast.success("Reunião excluída.");
    router.push("/admin/atas");
  }

  const atuais = assinaturas.filter((s) => s.versao === ata.versao && s.status !== "cancelada");
  const pdf = (v: string) => `/api/atas/${ata.id}/pdf?v=${v}`;

  return (
    <div>
      <Link href="/admin/atas" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Reuniões
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-2">
            {TIPOS_ATA[ata.tipo].rotulo} · {STATUS_ROTULO[ata.status]}
            {ata.versao > 1 ? ` · versão ${ata.versao}` : ""}
          </p>
          {editavel ? (
            <input value={titulo} onChange={(e) => mudou(setTitulo)(e.target.value)} maxLength={160} className="page-title w-full max-w-2xl rounded-lg bg-transparent px-1 -mx-1 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none" aria-label="Título" />
          ) : (
            <h1 className="page-title">{titulo}</h1>
          )}
          <p className="mt-1 text-sm text-muted">
            {ata.cliente ? `${ata.cliente} · ` : ""}
            {dataHoraBr(ata.data_reuniao)}
            {ata.local ? ` · ${ata.local}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ata.temFinal && (
            <a href={pdf("assinada")} target="_blank" rel="noreferrer" className="ui-btn">
              <Download className="h-4 w-4" aria-hidden /> PDF assinado
            </a>
          )}
          {ata.texto && (
            <>
              <a href={pdf("completa")} target="_blank" rel="noreferrer" className="ui-btn-secondary">
                <FileText className="h-4 w-4" aria-hidden /> PDF completo
              </a>
              {interna && TIPOS_ATA[ata.tipo].assinaCliente && (
                <a href={pdf("cliente")} target="_blank" rel="noreferrer" className="ui-btn-secondary" data-tip="Sem a parte de uso interno">
                  <Eye className="h-4 w-4" aria-hidden /> Versão do cliente
                </a>
              )}
            </>
          )}
          {!["aguardando", "assinada"].includes(ata.status) && (
            <button type="button" onClick={() => void excluir()} className="icon-btn h-9 w-9" aria-label="Excluir reunião" data-tip="Excluir">
              <Trash2 aria-hidden />
            </button>
          )}
        </div>
      </div>

      {ata.status === "gravando" && (
        <Cartao icone={<Clock className="h-5 w-5" aria-hidden />} titulo="A gravação não foi encerrada">
          A aba da gravação foi fechada antes de encerrar? O que chegou ao servidor está salvo. Se a reunião já acabou, transcreva com o que foi gravado.
          <div className="mt-3">
            <Acao onClick={() => tentarDeNovo(true)}>Transcrever com o que foi gravado</Acao>
          </div>
        </Cartao>
      )}
      {ata.status === "processando" && (
        <Cartao icone={<Loader2 className="h-5 w-5 animate-spin" aria-hidden />} titulo="Transcrevendo a reunião…">
          Transcrevendo a gravação{duracao ? ` (${Math.round(duracao / 60)} min)` : ""} e fazendo o resumo. Costuma levar de 1 a 3 minutos; esta página atualiza sozinha. Pode fechar a aba: a reunião fica pronta aqui na lista.
        </Cartao>
      )}
      {ata.status === "erro" && (
        <Cartao perigo icone={<AlertTriangle className="h-5 w-5" aria-hidden />} titulo="Não deu para transcrever a reunião">
          {ata.erro ?? "Erro desconhecido."}
          <div className="mt-3">
            <Acao onClick={() => tentarDeNovo(false)}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Tentar de novo
            </Acao>
          </div>
        </Cartao>
      )}
      {rascunho && ata.correcao && (
        <Cartao perigo icone={<Pencil className="h-5 w-5" aria-hidden />} titulo="Correção pedida na assinatura">
          “{ata.correcao}”. Corrija e aprove de novo: sai a versão {ata.versao + 1} e todos assinam de novo.
        </Cartao>
      )}
      {ata.status === "assinada" && (
        <Cartao ok icone={<CheckCircle2 className="h-5 w-5" aria-hidden />} titulo="Ata assinada">
          {ata.via === "zapsign" ? "Assinada pela ZapSign: o PDF deles, com o relatório de assinaturas," : "O PDF com o registro das assinaturas"} está na ficha do cliente (ATAs)
          {ata.cliente ? " e na pasta dele no Drive, em “Atas assinadas”" : ""}.
          {ata.carimbo && (
            <span className="mt-1 block">
              Carimbo do tempo: {dataHoraBr(ata.carimbo.quando)} ({ata.carimbo.tsa}) ·{" "}
              <a href={pdf("carimbo")} className="underline underline-offset-2">
                baixar o carimbo (.tsr)
              </a>
            </span>
          )}
          {ata.selado && <span className="mt-1 block">PDF selado digitalmente com o certificado do escritório.</span>}
          {ata.codigo && ata.via === "portal" && <span className="mt-1 block">Código de validação: {ata.codigo} (mcadvogados.app.br/validar)</span>}
        </Cartao>
      )}

      {atuais.length > 0 && <Assinaturas ata={ata} linhas={atuais} />}

      {reuniao && ata.transcricaoId && (
        <ReuniaoEntrega
          ataId={ata.id}
          transcricaoId={ata.transcricaoId}
          titulo={titulo}
          criadaEm={ata.criadaEm}
          duracao={duracao}
          tipo={ata.tipo}
          texto={transcricao ?? ""}
          resumo={resumo ?? ""}
          audio={audio}
          gerando={ata.status === "gerando"}
          erro={ata.erro}
        />
      )}

      {ata.texto !== null && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {audio && (
              <div className="sticky top-16 z-10 mb-3 rounded-xl border border-border bg-surface/95 p-2 backdrop-blur">
                <audio ref={player} controls src={audio} preload="metadata" className="h-9 w-full" />
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist">
                {(
                  [
                    ["ver", "Ver"],
                    ...(rascunho ? [["editar", "Editar"]] : []),
                    ...(resumo?.trim() ? [["resumo", "Resumo"]] : []),
                    ...(transcricao ? [["transcricao", "Transcrição"]] : []),
                  ] as [typeof aba, string][]
                ).map(([id, rotulo]) => (
                  <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`rounded-md px-3 py-1.5 text-sm ${aba === id ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
              {rascunho && <span className="text-xs text-muted">{salvo === "salvo" ? "Salvo" : salvo === "salvando" ? "Salvando…" : "Editando…"}</span>}
              {rascunho && (
                <button type="button" onClick={() => setEditandoDados(true)} className="ml-auto text-sm text-muted hover:text-foreground">
                  Participantes e dados
                </button>
              )}
            </div>
            {aba === "editar" && rascunho ? (
              <div>
                <p className="mb-2 text-xs text-muted">
                  Formato: <code># Seção</code> · <code>## Subseção</code> · <code>• item</code> · <code>Rótulo: valor</code> · o <code>[00:12:40]</code> no fim liga o item à gravação. Seção com “(uso interno do escritório)” não vai para o cliente.
                </p>
                <textarea value={texto} onChange={(e) => mudou(setTexto)(e.target.value)} rows={30} spellCheck className="ui-input min-h-[60vh] resize-y font-mono text-[13px] leading-relaxed" aria-label="Texto da ata" />
              </div>
            ) : aba === "resumo" && resumo?.trim() ? (
              <pre className="ui-card max-h-[75vh] overflow-y-auto p-5 font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground">{resumo}</pre>
            ) : aba === "transcricao" && transcricao ? (
              <pre className="ui-card max-h-[75vh] overflow-y-auto p-5 font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {transcricao.split("\n").map((l, i) => {
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
            ) : (
              <AtaDocumento dados={dados} blocos={!rascunho && ata.status !== "erro" && TIPOS_ATA[ata.tipo].assinaCliente ? blocosParaCliente(blocos) : blocos} onMinuto={audio ? tocar : undefined} />
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            {rascunho && (
              <section className="ui-card p-5">
                <h2 className="section-title !text-base">Aprovar</h2>
                <p className="mt-1 text-sm text-muted">
                  Ao aprovar, você assina pelo escritório e {TIPOS_ATA[ata.tipo].assinaCliente ? "o link de assinatura vai para cada pessoa de fora" : "a ata fica pronta"}. Depois disso o texto fica travado: corrigir gera uma nova versão.
                </p>
                <button type="button" onClick={() => setAprovando(true)} className="ui-btn mt-3 w-full justify-center">
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Aprovar{TIPOS_ATA[ata.tipo].assinaCliente ? " e enviar para assinatura" : ""}
                </button>
              </section>
            )}
            {rascunho && <Conferencia alertas={ata.alertas} onMinuto={audio ? tocar : undefined} />}
          </aside>
        </div>
      )}

      {aprovando && <Aprovar ata={ata} participantes={participantes} meuNome={meuNome} zapsign={zapsign} onFechar={() => setAprovando(false)} onFeito={() => router.refresh()} />}
      {editandoDados && <EditarParticipantes valor={participantes} onFechar={() => setEditandoDados(false)} onSalvar={(p) => (mudou(setParticipantes)(p), setEditandoDados(false))} />}
    </div>
  );
}

function Cartao({ icone, titulo, children, perigo, ok }: { icone: React.ReactNode; titulo: string; children: React.ReactNode; perigo?: boolean; ok?: boolean }) {
  return (
    <div className={`mb-6 flex gap-3 rounded-2xl border p-4 ${perigo ? "border-status-danger/30 bg-status-danger-bg" : ok ? "border-status-success/30 bg-status-success-bg" : "border-border bg-surface-2"}`}>
      <span className={`mt-0.5 shrink-0 ${perigo ? "text-status-danger" : ok ? "text-status-success" : "text-foreground/70"}`}>{icone}</span>
      <div className="text-sm text-foreground">
        <p className="font-semibold">{titulo}</p>
        <div className="mt-0.5 text-muted">{children}</div>
      </div>
    </div>
  );
}

function Acao({ onClick, children }: { onClick: () => Promise<void>; children: React.ReactNode }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        try {
          await onClick();
        } finally {
          setOcupado(false);
        }
      }}
      className="ui-btn"
    >
      {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function Conferencia({ alertas, onMinuto }: { alertas: Alerta[]; onMinuto?: (m: string) => void }) {
  return (
    <section className="ui-card p-5">
      <h2 className="section-title !text-base">Conferência da IA</h2>
      {alertas.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Check className="h-4 w-4 text-status-success" aria-hidden /> Nada de estranho entre a ata e a transcrição. Mesmo assim, confira valores, datas e nomes.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {alertas.map((a, i) => (
            <li key={i} className={`rounded-lg border-l-4 p-3 text-sm ${a.tipo === "nao_dito" ? "border-status-danger bg-status-danger-bg" : "border-status-pending bg-status-pending-bg"}`}>
              <p className="text-xs font-semibold tracking-wide text-foreground/80 uppercase">{a.tipo === "nao_dito" ? "Na ata, mas não foi dito assim" : "Foi dito e ficou de fora"}</p>
              <p className="mt-1 text-foreground">“{a.texto}”</p>
              {a.motivo && <p className="mt-1 text-muted">{a.motivo}</p>}
              {a.minuto && onMinuto && (
                <button type="button" onClick={() => onMinuto(a.minuto!)} className="mt-1 font-mono text-xs text-muted hover:text-foreground">
                  ouvir [{a.minuto}]
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────── assinaturas ───────── */

function Assinaturas({ ata, linhas }: { ata: Ata; linhas: AssinaturaLinha[] }) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<{ nome: string; itens: { rotulo: string; url: string }[] } | null>(null);
  const assinam = linhas.filter((l) => !l.observador);
  const feitas = assinam.filter((l) => l.status === "assinada").length;
  async function reenviar(id: string) {
    const r = await reenviarAssinaturaAction(id);
    if (!r.ok) return void toast.error(r.erro);
    toast.success(r.via?.length ? `Link novo enviado por ${r.via.join(" e ")}.` : "Link novo criado, mas não consegui enviar (confira o WhatsApp/e-mail).");
    router.refresh();
  }
  async function cancelar() {
    if (!confirm("Cancelar as assinaturas pendentes e voltar a ata para rascunho? Os links enviados param de funcionar.")) return;
    const r = await cancelarAssinaturasAction(ata.id);
    if (!r.ok) return void toast.error(r.erro);
    router.refresh();
  }
  async function copiarLink(id: string) {
    const link = await linkDeAssinaturaAction(id);
    if (!link) return void toast.error("Sem link para essa pessoa (ainda não é a vez dela?).");
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Link copiado. É pessoal: mande só para essa pessoa.");
  }
  async function atualizar() {
    const r = await sincronizarZapsignAction(ata.id);
    if (!r.ok) return void toast.error(r.erro);
    toast.success(r.status === "assinada" ? "Todos assinaram na ZapSign." : "Status atualizado.");
    router.refresh();
  }
  async function verArquivos(l: AssinaturaLinha) {
    const itens = await arquivosDaAssinaturaAction(l.id);
    if (!itens.length) return void toast("Nada guardado para essa pessoa.");
    setArquivos({ nome: l.nome, itens });
  }
  return (
    <section className="ui-card mb-6 p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="section-title !text-base">
          Assinaturas <span className="font-normal text-muted">({feitas} de {assinam.length})</span>
          {ata.via === "zapsign" && <span className="ml-2 rounded-full bg-status-info-bg px-2 py-0.5 text-[11px] font-medium text-status-info">pela ZapSign</span>}
        </h2>
        {ata.status === "aguardando" && (
          <span className="flex items-center gap-3">
            {ata.via === "zapsign" && (
              <button type="button" onClick={() => void atualizar()} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Atualizar status
              </button>
            )}
            <button type="button" onClick={() => void cancelar()} className="text-sm text-muted hover:text-foreground">
              Cancelar e voltar para rascunho
            </button>
          </span>
        )}
      </div>
      <ul className="divide-y divide-border">
        {linhas.map((l) => {
          const pedidos = [l.exige.selfie && "selfie", l.exige.documento && "documento", l.exige.certificado && "certificado"].filter(Boolean) as string[];
          return (
            <li key={l.id} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  l.observador ? "bg-surface-2 text-muted" : l.status === "assinada" ? "bg-status-success-bg text-status-success" : l.status === "pendente" ? "bg-surface-2 text-muted" : "bg-status-danger-bg text-status-danger"
                }`}
              >
                {l.observador ? <Eye className="h-4 w-4" aria-hidden /> : l.status === "assinada" ? <Check className="h-4 w-4" aria-hidden /> : l.status === "pendente" ? <Clock className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">
                  {ata.ordemAssinatura && !l.observador && l.papel !== "escritorio" ? `${l.ordem}. ` : ""}
                  {l.nome} <span className="font-normal text-muted">· {l.observador ? "Observador" : (PAPEL_ROTULO[l.papel as Participante["papel"]] ?? l.papel)}</span>
                  {l.alerta && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-status-danger-bg px-2 py-0.5 text-[11px] font-medium text-status-danger">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> conferir identidade
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted">
                  {l.observador
                    ? `Acompanha · link enviado ${l.enviado_em ? `em ${dataHoraBr(l.enviado_em)}` : "—"}`
                    : l.status === "assinada"
                      ? `Assinou em ${dataHoraBr(l.assinado_em!)}${l.assinado_via ? ` · ${l.assinado_via}` : ""}`
                      : l.status === "correcao"
                        ? `Pediu correção: “${l.correcao}”`
                        : l.status === "recusada"
                          ? `Recusou: “${l.recusa}”`
                          : l.enviado_em
                            ? `Aguardando · link enviado em ${dataHoraBr(l.enviado_em)}${l.lembretes ? ` · ${l.lembretes} lembrete(s)` : ""}${pedidos.length ? ` · pede ${pedidos.join(", ")}` : ""}`
                            : "Aguardando a vez (ordem de assinatura)"}
                </span>
                {l.extras.map((x, i) => (
                  <span key={i} className="block text-xs text-muted">
                    {x}
                  </span>
                ))}
                {l.local && l.status === "assinada" && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <MapPin className="h-3 w-3" aria-hidden /> {l.local}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap gap-2">
                {(l.tem.selfie || l.tem.documento || l.tem.p7s || (l.tem.assinatura && l.status === "assinada")) && (
                  <button type="button" onClick={() => void verArquivos(l)} className="ui-btn-secondary px-2.5 py-1.5 text-xs">
                    <Eye className="h-3.5 w-3.5" aria-hidden /> Provas
                  </button>
                )}
                {l.status === "pendente" && ata.status === "aguardando" && l.enviado_em && !l.observador && (
                  <button type="button" onClick={() => void copiarLink(l.id)} className="ui-btn-secondary px-2.5 py-1.5 text-xs">
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar link
                  </button>
                )}
                {l.status === "pendente" && ata.status === "aguardando" && l.enviado_em && ata.via === "portal" && (
                  <button type="button" onClick={() => void reenviar(l.id)} className="ui-btn-secondary px-2.5 py-1.5 text-xs">
                    <Send className="h-3.5 w-3.5" aria-hidden /> Reenviar link
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {arquivos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Provas de ${arquivos.nome}`} onClick={() => setArquivos(null)}>
          <div className="ui-card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Provas da assinatura — {arquivos.nome}</h3>
              <button type="button" onClick={() => setArquivos(null)} className="icon-btn h-8 w-8" aria-label="Fechar">
                <X aria-hidden />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {arquivos.itens.map((a) => (
                <figure key={a.rotulo} className="rounded-xl border border-border p-2">
                  {a.rotulo.includes(".p7s") ? (
                    <a href={a.url} className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-foreground hover:underline">
                      <ShieldCheck className="h-8 w-8 text-status-success" aria-hidden /> Baixar a assinatura digital (.p7s)
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- link temporário do Storage
                    <img src={a.url} alt={a.rotulo} className={`w-full rounded-lg object-contain ${a.rotulo === "Assinatura" ? "h-28 bg-white" : "max-h-72"}`} />
                  )}
                  <figcaption className="mt-1 text-center text-xs text-muted">{a.rotulo}</figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Dados pessoais sensíveis (LGPD): não compartilhe estas imagens. Os links valem 10 minutos.</p>
          </div>
        </div>
      )}
    </section>
  );
}

type Linha = Participante & { marcado: boolean; observador: boolean; ordem: number; selfie: boolean; documento: boolean; certificado: boolean };

function Aprovar({ ata, participantes, meuNome, zapsign, onFechar, onFeito }: { ata: Ata; participantes: Participante[]; meuNome: string; zapsign: ZapsignInfo; onFechar: () => void; onFeito: () => void }) {
  const [via, setVia] = useState<"portal" | "zapsign">("portal");
  const [facial, setFacial] = useState(false);
  const assinaCliente = TIPOS_ATA[ata.tipo].assinaCliente;
  const candidatos = participantes.filter((p) => p.nome !== meuNome);
  const [lista, setLista] = useState<Linha[]>(() =>
    candidatos.map((p, i) => ({ ...p, marcado: p.papel !== "escritorio", observador: false, ordem: i + 1, selfie: false, documento: false, certificado: false }))
  );
  const [ordem, setOrdem] = useState(false);
  const [prazo, setPrazo] = useState(30);
  const [lembretes, setLembretes] = useState("2,5");
  const [minha, setMinha] = useState<AssinaturaFeita>(null);
  const [ocupado, setOcupado] = useState(false);
  const muda = (i: number, c: Partial<Linha>) => setLista((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x)));
  async function aprovar() {
    const escolhidos = lista.filter((p) => p.marcado);
    for (const p of escolhidos) if (!(p.telefone || "").replace(/\D/g, "") && !(p.email || "").includes("@")) return void toast.error(`Falta o WhatsApp ou o e-mail de ${p.nome}.`);
    if (via === "portal" && !minha) return void toast.error("Faça a sua assinatura (você assina pelo escritório).");
    setOcupado(true);
    const r = await aprovarAtaAction(
      ata.id,
      escolhidos.map((p) => ({
        nome: p.nome,
        papel: p.papel,
        profile_id: p.profile_id,
        telefone: p.telefone,
        email: p.email,
        cargo: p.cargo,
        observador: p.observador,
        ordem: p.ordem,
        exige: { selfie: p.selfie, documento: p.documento, certificado: p.certificado },
      })),
      { ordem, prazoDias: prazo, lembretes: lembretes ? lembretes.split(",").map(Number) : [], via, reconhecimentoFacial: facial },
      minha?.png ?? null
    );
    setOcupado(false);
    if (!r.ok) return void toast.error(r.erro);
    toast.success(r.enviados.length ? `Aprovada. Link enviado para ${r.enviados.map((e) => `${e.nome}${e.via.length ? ` (${e.via.join(" e ")})` : " (sem envio!)"}`).join(", ")}.` : "Ata aprovada.");
    onFechar();
    onFeito();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Aprovar a ata" onClick={onFechar}>
      <div className="ui-card flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">Aprovar{assinaCliente ? " e enviar para assinatura" : ""}</h3>
          <button type="button" onClick={onFechar} className="icon-btn h-8 w-8" aria-label="Fechar">
            <X aria-hidden />
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto p-5 text-sm">
          {assinaCliente && (
            <fieldset>
              <legend className="mb-2 font-medium text-foreground">Assinar pelo</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`cursor-pointer rounded-xl border p-3 ${via === "portal" ? "border-navy bg-surface-2 ring-1 ring-navy" : "border-border"}`}>
                  <input type="radio" name="via" checked={via === "portal"} onChange={() => setVia("portal")} className="sr-only" />
                  <span className="block font-semibold text-foreground">Portal MC (padrão)</span>
                  <span className="block text-xs text-muted">Grátis. Código, desenho, selfie/documento com IA, certificado A1, carimbo do tempo.</span>
                </label>
                <label className={`rounded-xl border p-3 ${!zapsign.ok ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${via === "zapsign" ? "border-navy bg-surface-2 ring-1 ring-navy" : "border-border"}`}>
                  <input type="radio" name="via" checked={via === "zapsign"} disabled={!zapsign.ok} onChange={() => setVia("zapsign")} className="sr-only" />
                  <span className="block font-semibold text-foreground">ZapSign (ata complexa){zapsign.sandbox ? " · teste" : ""}</span>
                  <span className="block text-xs text-muted">
                    {zapsign.ok ? "Para Junta/cartório, disputa, A3 ou Gov.br: registro da empresa neutra e reconhecimento facial certificado." : "Falta ligar a API da ZapSign (plano com API)."}
                  </span>
                </label>
              </div>
            </fieldset>
          )}
          {via === "portal" ? (
            <div>
              <p className="mb-2 font-medium text-foreground">Sua assinatura ({meuNome}, pelo escritório)</p>
              <div className="rounded-xl bg-slate-50 p-3 text-[#1b1f24] dark:bg-white">
                <AssinaturaPad nome={meuNome} onChange={setMinha} />
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-foreground">
              <p>
                <b>{meuNome}</b> também assina pela ZapSign (o link chega no seu e-mail). Cada pessoa recebe o link por e-mail (ZapSign) e pelo WhatsApp do escritório. Quando todos
                assinarem, o PDF da ZapSign vem sozinho para a ficha do cliente e o Drive.
              </p>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={facial} onChange={(e) => setFacial(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--navy)]" />
                <span>
                  Reconhecimento facial com prova de vida para quem tiver <b>selfie + documento</b> marcados <span className="text-muted">(cobrado pela ZapSign por pessoa)</span>
                </span>
              </label>
            </div>
          )}
          {assinaCliente && temParteInterna(ata.texto) && <p className="text-muted">A parte “uso interno do escritório” não vai para quem assina.</p>}

          <div>
            <p className="mb-2 font-medium text-foreground">{lista.length ? "Quem mais participa da assinatura" : "Ninguém mais na lista de participantes."}</p>
            <div className="space-y-2">
              {lista.map((p, i) => (
                <div key={i} className={`rounded-xl border p-3 ${p.marcado ? "border-navy" : "border-border"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 font-medium text-foreground">
                      <input type="checkbox" checked={p.marcado} onChange={(e) => muda(i, { marcado: e.target.checked })} className="h-4 w-4 accent-[var(--navy)]" />
                      {p.nome} <span className="font-normal text-muted">· {PAPEL_ROTULO[p.papel]}</span>
                    </label>
                    {p.marcado && (
                      <select value={p.observador ? "observa" : "assina"} onChange={(e) => muda(i, { observador: e.target.value === "observa" })} className="ui-input !w-auto !py-1 text-xs" aria-label={`Papel de ${p.nome}`}>
                        <option value="assina">Assina</option>
                        <option value="observa">Só acompanha</option>
                      </select>
                    )}
                    {p.marcado && ordem && !p.observador && (
                      <input type="number" min={1} max={20} value={p.ordem} onChange={(e) => muda(i, { ordem: Number(e.target.value) || 1 })} className="ui-input !w-16 !py-1 text-xs" aria-label={`Ordem de ${p.nome}`} />
                    )}
                  </div>
                  {p.marcado && (
                    <>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="relative block">
                          <MessageCircle className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
                          <input value={p.telefone ?? ""} onChange={(e) => muda(i, { telefone: e.target.value })} placeholder="WhatsApp com DDD" inputMode="tel" className="ui-input !py-1.5 pl-8 text-sm" aria-label={`WhatsApp de ${p.nome}`} />
                        </label>
                        <label className="relative block">
                          <Mail className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
                          <input value={p.email ?? ""} onChange={(e) => muda(i, { email: e.target.value })} placeholder="E-mail" inputMode="email" className="ui-input !py-1.5 pl-8 text-sm" aria-label={`E-mail de ${p.nome}`} />
                        </label>
                      </div>
                      {!p.observador && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
                          <span className="text-muted">Além do código e da assinatura, pedir:</span>
                          {(
                            [
                              ["selfie", "Selfie"],
                              ["documento", "Documento com foto"],
                              ["certificado", "Certificado digital A1"],
                            ] as const
                          ).map(([k, r]) => (
                            <label key={k} className="flex items-center gap-1.5">
                              <input type="checkbox" checked={p[k]} onChange={(e) => muda(i, { [k]: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--navy)]" />
                              {r}
                            </label>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-foreground">
              <input type="checkbox" checked={ordem} onChange={(e) => setOrdem(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />
              Ordem de assinatura
            </label>
            <label className="flex items-center gap-2 text-foreground">
              Prazo
              <select value={prazo} onChange={(e) => setPrazo(Number(e.target.value))} className="ui-input !w-auto !py-1 text-xs">
                {[3, 7, 15, 30, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-foreground">
              Lembretes
              <select value={lembretes} onChange={(e) => setLembretes(e.target.value)} className="ui-input !w-auto !py-1 text-xs">
                <option value="2,5">em 2 e 5 dias</option>
                <option value="1,2,3,4,5,6">todo dia</option>
                <option value="3">em 3 dias</option>
                <option value="">sem lembrete</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-muted">Cada pessoa recebe um link pessoal, confere a ata, faz a assinatura (desenho ou nome digitado), o que você pediu acima e confirma com um código de 6 dígitos.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onFechar} className="ui-btn-secondary">
            Voltar
          </button>
          <button type="button" disabled={ocupado} onClick={() => void aprovar()} className="ui-btn">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            {lista.some((p) => p.marcado) ? "Aprovar e enviar" : "Aprovar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditarParticipantes({ valor, onFechar, onSalvar }: { valor: Participante[]; onFechar: () => void; onSalvar: (p: Participante[]) => void }) {
  const [lista, setLista] = useState<Participante[]>(valor);
  const muda = (i: number, campo: keyof Participante, v: string) => setLista((l) => l.map((x, j) => (j === i ? { ...x, [campo]: v } : x)));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Participantes" onClick={onFechar}>
      <div className="ui-card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">Participantes</h3>
          <button type="button" onClick={onFechar} className="icon-btn h-8 w-8" aria-label="Fechar">
            <X aria-hidden />
          </button>
        </div>
        <div className="space-y-2 overflow-y-auto p-5">
          {lista.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_0.9fr_1fr_1fr_1.3fr_auto]">
              <input value={p.nome} onChange={(e) => muda(i, "nome", e.target.value)} placeholder="Nome" aria-label="Nome" className="ui-input !py-1.5 text-sm" />
              <select value={p.papel} onChange={(e) => muda(i, "papel", e.target.value)} className="ui-input !py-1.5 text-sm" aria-label="Papel">
                <option value="escritorio">Escritório</option>
                <option value="cliente">Cliente</option>
                <option value="testemunha">Testemunha</option>
                <option value="outro">Convidado</option>
              </select>
              <input value={p.cargo ?? ""} onChange={(e) => muda(i, "cargo", e.target.value)} placeholder="Cargo" aria-label="Cargo" className="ui-input !py-1.5 text-sm" />
              <input value={p.telefone ?? ""} onChange={(e) => muda(i, "telefone", e.target.value)} placeholder="WhatsApp" aria-label="WhatsApp" className="ui-input !py-1.5 text-sm" />
              <input value={p.email ?? ""} onChange={(e) => muda(i, "email", e.target.value)} placeholder="E-mail" aria-label="E-mail" className="ui-input !py-1.5 text-sm" />
              <button type="button" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} className="icon-btn h-8 w-8 self-center" aria-label="Tirar">
                <X aria-hidden />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setLista((l) => [...l, { nome: "", papel: "cliente" }])} className="ui-btn-secondary mt-2 px-3 py-1.5 text-sm">
            + Adicionar
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onFechar} className="ui-btn-secondary">
            Voltar
          </button>
          <button type="button" onClick={() => onSalvar(lista.filter((p) => p.nome.trim()))} className="ui-btn">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

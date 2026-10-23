"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, CheckCircle2, Clock, Download, Eye, FileKey2, Loader2, Mail, MapPin, MessageCircle, PenLine, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";
import type { pki } from "node-forge";
import { AtaDocumento } from "@/components/atas/ata-documento";
import { useTopoAoTrocar } from "@/lib/use-topo";
import { AssinaturaPad, type AssinaturaFeita } from "@/components/atas/assinatura-pad";
import type { BlocoAta, DadosAta } from "@/lib/atas/formato";
import {
  assinarAction,
  pedirCodigoAction,
  pedirCorrecaoAction,
  recusarAction,
  salvarAssinaturaAction,
  salvarCertificadoAction,
  salvarDocumentoAction,
  salvarGpsAction,
  salvarSelfieAction,
} from "./actions";

export type EstadoPagina = "pendente" | "assinei" | "concluida" | "travada" | "observador" | "aguardando_vez";
type Etapa = "ler" | "assinatura" | "selfie" | "documento" | "certificado" | "confirmar";

const ROTULO: Record<Etapa, string> = { ler: "Ler", assinatura: "Assinatura", selfie: "Selfie", documento: "Documento", certificado: "Certificado", confirmar: "Confirmar" };
const AZUL = "bg-[#11273b] text-white hover:bg-[#091827]";

export function AssinarApp({
  token,
  nome,
  dados,
  blocos,
  estado,
  assineiEm,
  prazo,
  exige,
  feito,
  canais,
  signatarios,
  ordem,
  hash,
  codigo,
}: {
  token: string;
  nome: string;
  dados: DadosAta;
  blocos: BlocoAta[];
  estado: EstadoPagina;
  assineiEm: string | null;
  prazo: string | null;
  exige: { selfie: boolean; documento: boolean; certificado: boolean };
  feito: { assinatura: boolean; selfie: boolean; documento: boolean; certificado: boolean };
  canais: { zap: string | null; email: string | null };
  signatarios: { nome: string; assinou: boolean }[];
  ordem: boolean;
  hash: string | null;
  codigo: string | null;
}) {
  const router = useRouter();
  const etapas = useMemo<Etapa[]>(() => ["ler", "assinatura", ...(exige.selfie ? (["selfie"] as const) : []), ...(exige.documento ? (["documento"] as const) : []), ...(exige.certificado ? (["certificado"] as const) : []), "confirmar"], [exige]);
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [painel, setPainel] = useState<null | "corrigir" | "recusar">(null);
  const [feitos, setFeitos] = useState(feito);
  useTopoAoTrocar(etapa);
  const primeiro = nome.split(/\s+/)[0];
  const pdf = `/assinar/${token}/pdf`;
  const proxima = (atual: Etapa) => setEtapa(etapas[etapas.indexOf(atual) + 1] ?? "confirmar");

  if (etapa && etapa !== "ler" && estado === "pendente")
    return (
      <Moldura pdf={pdf}>
        <Passos etapas={etapas} atual={etapa} />
        <div className="mx-auto max-w-[560px] px-4 pb-16">
          {etapa === "assinatura" && <EtapaAssinatura token={token} nome={nome} onPronto={() => (setFeitos((f) => ({ ...f, assinatura: true })), proxima("assinatura"))} onVoltar={() => setEtapa(null)} />}
          {etapa === "selfie" && <EtapaSelfie token={token} jaTem={feitos.selfie} onPronto={() => (setFeitos((f) => ({ ...f, selfie: true })), proxima("selfie"))} onVoltar={() => setEtapa(etapas[etapas.indexOf("selfie") - 1])} />}
          {etapa === "documento" && <EtapaDocumento token={token} jaTem={feitos.documento} onPronto={() => (setFeitos((f) => ({ ...f, documento: true })), proxima("documento"))} onVoltar={() => setEtapa(etapas[etapas.indexOf("documento") - 1])} />}
          {etapa === "certificado" && <EtapaCertificado token={token} pdf={pdf} jaTem={feitos.certificado} onPronto={() => (setFeitos((f) => ({ ...f, certificado: true })), proxima("certificado"))} onVoltar={() => setEtapa(etapas[etapas.indexOf("certificado") - 1])} />}
          {etapa === "confirmar" && <EtapaConfirmar token={token} canais={canais} onAssinou={() => (setEtapa(null), router.refresh())} onVoltar={() => setEtapa(etapas[etapas.length - 2])} />}
        </div>
      </Moldura>
    );

  return (
    <Moldura pdf={pdf}>
      <section className="mx-auto max-w-[760px] px-4 pt-6">
        {estado === "concluida" ? (
          <Faixa cor="verde" icone={<CheckCircle2 className="h-5 w-5" aria-hidden />} titulo="Ata assinada por todos">
            O PDF assinado, com as assinaturas e o registro, está no botão <b>Baixar PDF</b>.{codigo ? ` Código de validação: ${codigo}.` : ""}
          </Faixa>
        ) : estado === "assinei" ? (
          <Faixa cor="verde" icone={<CheckCircle2 className="h-5 w-5" aria-hidden />} titulo={`Você assinou${assineiEm ? ` em ${assineiEm}` : ""}`}>
            Falta a assinatura de {signatarios.filter((s) => !s.assinou).map((s) => s.nome).join(", ") || "outra pessoa"}. Quando todos assinarem, você recebe o aviso e a cópia final fica neste link.
          </Faixa>
        ) : estado === "observador" ? (
          <Faixa cor="azul" icone={<Eye className="h-5 w-5" aria-hidden />} titulo={`Olá, ${primeiro}! Você é observador desta ata`}>
            Você não precisa assinar. Acompanhe aqui quem já assinou; quando todos assinarem, a cópia final fica neste link.
          </Faixa>
        ) : estado === "aguardando_vez" ? (
          <Faixa cor="azul" icone={<Clock className="h-5 w-5" aria-hidden />} titulo="Ainda não é a sua vez">
            Esta ata tem ordem de assinatura. Você recebe um aviso quando chegar a sua vez. Enquanto isso, já pode ler.
          </Faixa>
        ) : estado === "travada" ? (
          <Faixa cor="amarelo" icone={<ShieldCheck className="h-5 w-5" aria-hidden />} titulo="Link travado">
            Houve muitas tentativas com código errado. Peça um novo link ao escritório.
          </Faixa>
        ) : (
          <div>
            <h1 className="text-xl font-semibold">Olá, {primeiro}!</h1>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-600">
              Leia a ata abaixo. Para assinar você vai: fazer a sua assinatura
              {exige.selfie ? ", tirar uma selfie" : ""}
              {exige.documento ? ", fotografar o seu documento" : ""}
              {exige.certificado ? ", usar o seu certificado digital" : ""} e confirmar com um código de 6 dígitos.
              {prazo ? ` Prazo: ${prazo}.` : ""}
            </p>
          </div>
        )}
        {signatarios.length > 1 && (
          <ol className="mt-4 flex flex-wrap gap-2 text-[13px]">
            {signatarios.map((s, i) => (
              <li key={i} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${s.assinou ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-slate-600 ring-slate-200"}`}>
                {s.assinou ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <PenLine className="h-3.5 w-3.5" aria-hidden />}
                {ordem ? `${i + 1}. ` : ""}
                {s.nome} · {s.assinou ? "assinou" : "falta assinar"}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-6 px-2 sm:px-4">
        <AtaDocumento dados={dados} blocos={blocos} />
        {(hash || codigo) && (
          <p className="mx-auto mt-3 max-w-[760px] px-2 font-mono text-[10.5px] break-all text-slate-400">
            {codigo ? `Código de validação ${codigo} · ` : ""}
            {hash ? `Impressão digital ${hash}` : ""}
          </p>
        )}
      </div>

      {estado === "pendente" && (
        <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-[760px] px-4 py-3">
            {painel ? (
              <Motivo token={token} tipo={painel} onVoltar={() => setPainel(null)} onEnviou={() => router.refresh()} />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button type="button" onClick={() => setEtapa("assinatura")} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold ${AZUL}`}>
                  <PenLine className="h-4 w-4" aria-hidden /> Li e quero assinar
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPainel("corrigir")} className="flex-1 rounded-xl px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">
                    Pedir correção
                  </button>
                  <button type="button" onClick={() => setPainel("recusar")} className="flex-1 rounded-xl px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 hover:bg-red-50">
                    Recusar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Moldura>
  );
}

/* ───────── moldura e passos ───────── */

function Moldura({ pdf, children }: { pdf: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4f2ee] pb-44 text-[#1b1f24]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-3 px-4 py-3">
          <p className="text-[13px] font-bold tracking-wide">MC ADVOGADOS</p>
          <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            <Download className="h-4 w-4" aria-hidden /> Baixar PDF
          </a>
        </div>
      </header>
      {children}
    </main>
  );
}

function Passos({ etapas, atual }: { etapas: Etapa[]; atual: Etapa }) {
  const i = etapas.indexOf(atual);
  return (
    <ol className="mx-auto flex max-w-[560px] items-center gap-1 overflow-x-auto px-4 py-5" aria-label="Etapas da assinatura">
      {etapas.map((e, j) => (
        <li key={e} className="flex shrink-0 items-center gap-1">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${j < i ? "bg-emerald-600 text-white" : j === i ? "bg-[#11273b] text-white" : "bg-white text-slate-400 ring-1 ring-slate-300"}`}>
            {j < i ? <Check className="h-3.5 w-3.5" aria-hidden /> : j + 1}
          </span>
          <span className={`text-xs ${j === i ? "font-semibold text-[#1b1f24]" : "text-slate-500"}`}>{ROTULO[e]}</span>
          {j < etapas.length - 1 && <span className="mx-1 h-px w-4 bg-slate-300" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function Faixa({ cor, icone, titulo, children }: { cor: "verde" | "amarelo" | "azul"; icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  const c = cor === "verde" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : cor === "azul" ? "bg-sky-50 text-sky-900 ring-sky-200" : "bg-amber-50 text-amber-900 ring-amber-200";
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ring-1 ${c}`}>
      <span className="mt-0.5 shrink-0">{icone}</span>
      <div>
        <p className="font-semibold">{titulo}</p>
        <p className="mt-0.5 text-sm leading-relaxed opacity-90">{children}</p>
      </div>
    </div>
  );
}

function Cartao({ titulo, texto, children }: { titulo: string; texto?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {texto && <p className="mt-1 text-sm leading-relaxed text-slate-600">{texto}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Botoes({ onVoltar, onSeguir, ocupado, pode, rotulo = "Continuar" }: { onVoltar: () => void; onSeguir: () => void; ocupado?: boolean; pode: boolean; rotulo?: string }) {
  return (
    <div className="mt-5 flex items-center gap-3">
      <button type="button" onClick={onVoltar} className="rounded-xl px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">
        Voltar
      </button>
      <button type="button" disabled={!pode || ocupado} onClick={onSeguir} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold disabled:opacity-50 ${AZUL}`}>
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {rotulo}
      </button>
    </div>
  );
}

const Erro = ({ texto }: { texto: string | null }) => (texto ? <p className="mt-3 text-sm text-red-700" role="alert">{texto}</p> : null);

/* ───────── etapas ───────── */

function EtapaAssinatura({ token, nome, onPronto, onVoltar }: { token: string; nome: string; onPronto: () => void; onVoltar: () => void }) {
  const [assinatura, setAssinatura] = useState<AssinaturaFeita>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    if (!assinatura) return;
    setOcupado(true);
    setErro(null);
    const r = await salvarAssinaturaAction(token, assinatura.png, assinatura.tipo);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    onPronto();
  }
  return (
    <Cartao titulo="Sua assinatura" texto="Desenhe a sua assinatura ou digite o seu nome. Ela vai no fim da ata e como rubrica em cada página.">
      <AssinaturaPad nome={nome} onChange={setAssinatura} />
      <Erro texto={erro} />
      <Botoes onVoltar={onVoltar} onSeguir={() => void salvar()} ocupado={ocupado} pode={!!assinatura} />
    </Cartao>
  );
}

/** Reduz a foto (máx. 1280 px) e devolve JPEG. */
function paraJpeg(fonte: HTMLVideoElement | HTMLImageElement, espelhar = false): string {
  const w = fonte instanceof HTMLVideoElement ? fonte.videoWidth : fonte.naturalWidth;
  const h = fonte instanceof HTMLVideoElement ? fonte.videoHeight : fonte.naturalHeight;
  const escala = Math.min(1, 1280 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * escala);
  c.height = Math.round(h * escala);
  const ctx = c.getContext("2d")!;
  if (espelhar) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(fonte, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

function arquivoParaJpeg(f: File): Promise<string> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      ok(paraJpeg(img));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => falha(new Error("Não deu para abrir a imagem."));
    img.src = URL.createObjectURL(f);
  });
}

/** Câmera com guia (rosto oval ou documento retangular); se não houver câmera, escolhe arquivo. */
function Camera_({ frente, guia, onFoto }: { frente: boolean; guia: "rosto" | "documento"; onFoto: (jpeg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pronta, setPronta] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let vivo = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: frente ? "user" : { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (!vivo) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => {});
          setPronta(true);
        }
      } catch {
        if (vivo) setErro("Não deu para abrir a câmera. Libere a câmera no navegador ou envie uma foto.");
      }
    })();
    return () => {
      vivo = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [frente]);
  return (
    <div>
      {!erro ? (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className={`aspect-[4/3] w-full object-cover ${frente ? "-scale-x-100" : ""}`} />
          <div
            className={`pointer-events-none absolute border-[3px] border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] ${guia === "rosto" ? "inset-x-[24%] inset-y-[10%] rounded-[50%]" : "inset-x-[8%] inset-y-[18%] rounded-xl"}`}
            aria-hidden
          />
          {!pronta && <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-white" aria-hidden />}
        </div>
      ) : (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{erro}</p>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {!erro && (
          <button type="button" disabled={!pronta} onClick={() => video.current && onFoto(paraJpeg(video.current, frente))} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold disabled:opacity-50 ${AZUL}`}>
            <Camera className="h-4 w-4" aria-hidden /> Tirar foto
          </button>
        )}
        <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
          <Upload className="h-4 w-4" aria-hidden /> Enviar uma foto
          <input type="file" accept="image/*" capture={frente ? "user" : "environment"} className="sr-only" onChange={(e) => e.target.files?.[0] && void arquivoParaJpeg(e.target.files[0]).then(onFoto).catch(() => setErro("Não deu para abrir a imagem."))} />
        </label>
      </div>
    </div>
  );
}

function Consentimento({ marcado, onChange }: { marcado: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#11273b]" />
      <span>
        Autorizo o uso da minha selfie e da foto do meu documento <b>somente para comprovar esta assinatura</b>. As imagens ficam guardadas com o escritório junto da ata, com acesso restrito
        (Lei 13.709/2018 — LGPD).
      </span>
    </label>
  );
}

function EtapaSelfie({ token, jaTem, onPronto, onVoltar }: { token: string; jaTem: boolean; onPronto: () => void; onVoltar: () => void }) {
  const [aceito, setAceito] = useState(jaTem);
  const [foto, setFoto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    if (!foto) return jaTem ? onPronto() : undefined;
    setOcupado(true);
    setErro(null);
    const r = await salvarSelfieAction(token, foto);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    onPronto();
  }
  return (
    <Cartao titulo="Selfie" texto="Centralize o rosto no oval, com boa luz e sem óculos escuros ou boné.">
      <Consentimento marcado={aceito} onChange={setAceito} />
      {aceito &&
        (foto ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia local */}
            <img src={foto} alt="Prévia da selfie" className="w-full rounded-2xl" />
            <button type="button" onClick={() => setFoto(null)} className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:underline">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Tirar outra
            </button>
          </div>
        ) : (
          <Camera_ frente guia="rosto" onFoto={setFoto} />
        ))}
      {jaTem && !foto && <p className="mt-3 text-sm text-emerald-700">Selfie já enviada. Pode continuar ou tirar outra.</p>}
      <Erro texto={erro} />
      <Botoes onVoltar={onVoltar} onSeguir={() => void salvar()} ocupado={ocupado} pode={aceito && (!!foto || jaTem)} rotulo={foto ? "Usar esta foto" : "Continuar"} />
    </Cartao>
  );
}

function EtapaDocumento({ token, jaTem, onPronto, onVoltar }: { token: string; jaTem: boolean; onPronto: () => void; onVoltar: () => void }) {
  const [aceito, setAceito] = useState(jaTem);
  const [lado, setLado] = useState<"frente" | "verso">("frente");
  const [frente, setFrente] = useState<string | null>(null);
  const [verso, setVerso] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    if (!frente) return jaTem ? onPronto() : undefined;
    setOcupado(true);
    setErro(null);
    const r = await salvarDocumentoAction(token, frente, verso, cpf.replace(/\D/g, "") || null);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    onPronto();
  }
  const atual = lado === "frente" ? frente : verso;
  return (
    <Cartao titulo="Documento com foto" texto="RG, CNH ou CIN. Fotografe a frente e, se tiver, o verso, sem reflexo e com todo o documento dentro da moldura.">
      <Consentimento marcado={aceito} onChange={setAceito} />
      {aceito && (
        <>
          <div className="mb-3 inline-flex rounded-lg p-0.5 ring-1 ring-slate-300">
            {(["frente", "verso"] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLado(l)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${lado === l ? "bg-[#11273b] text-white" : "text-slate-600"}`}>
                {(l === "frente" ? frente : verso) && <Check className="h-3.5 w-3.5" aria-hidden />}
                {l === "frente" ? "Frente" : "Verso (opcional)"}
              </button>
            ))}
          </div>
          {atual ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local */}
              <img src={atual} alt={`Prévia do ${lado} do documento`} className="w-full rounded-2xl" />
              <button type="button" onClick={() => (lado === "frente" ? setFrente(null) : setVerso(null))} className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:underline">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Tirar outra
              </button>
            </div>
          ) : (
            <Camera_ key={lado} frente={false} guia="documento" onFoto={(f) => (lado === "frente" ? (setFrente(f), setLado("verso")) : setVerso(f))} />
          )}
          <label className="mt-4 block">
            <span className="text-sm font-medium">CPF</span>
            <input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" placeholder="000.000.000-00" className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-[#11273b] focus:outline-none" />
          </label>
        </>
      )}
      {jaTem && !frente && <p className="mt-3 text-sm text-emerald-700">Documento já enviado. Pode continuar ou fotografar de novo.</p>}
      <Erro texto={erro} />
      <Botoes onVoltar={onVoltar} onSeguir={() => void salvar()} ocupado={ocupado} pode={aceito && (!!frente || jaTem)} />
    </Cartao>
  );
}

function EtapaCertificado({ token, pdf, jaTem, onPronto, onVoltar }: { token: string; pdf: string; jaTem: boolean; onPronto: () => void; onVoltar: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(jaTem ? "Assinatura digital já registrada." : null);
  async function assinar() {
    if (!arquivo) return;
    setOcupado(true);
    setErro(null);
    try {
      const forge = (await import("node-forge")).default;
      const bin = (b: ArrayBuffer) => {
        const u = new Uint8Array(b);
        let s = "";
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
        return s;
      };
      let p12: ReturnType<typeof forge.pkcs12.pkcs12FromAsn1>;
      try {
        p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin(await arquivo.arrayBuffer())), senha);
      } catch {
        throw new Error("Senha errada ou arquivo que não é um certificado A1 (.pfx/.p12).");
      }
      const chaves = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []), ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])];
      const chave = chaves[0]?.key as pki.rsa.PrivateKey | undefined;
      if (!chave) throw new Error("Este certificado não tem a chave privada (o A3 em token não serve aqui; use o A1).");
      const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert!).filter(Boolean);
      const meu = certs.find((c) => (c.publicKey as pki.rsa.PublicKey).n.equals(chave.n));
      if (!meu) throw new Error("Não achei o certificado que combina com a chave.");
      if (meu.validity.notAfter < new Date()) throw new Error("Este certificado está vencido.");
      const resp = await fetch(pdf, { cache: "no-store" });
      if (!resp.ok) throw new Error("Não consegui baixar a ata para assinar.");
      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(bin(await resp.arrayBuffer()));
      p7.addCertificate(meu);
      for (const c of certs) if (c !== meu) p7.addCertificate(c);
      p7.addSigner({
        key: chave,
        certificate: meu,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() as unknown as string }],
      });
      p7.sign({ detached: true });
      const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
      const r = await salvarCertificadoAction(token, btoa(der));
      if (!r.ok) throw new Error(r.erro);
      setOk(`Assinado com o certificado de ${r.certificado.titular}${r.certificado.icp_brasil ? " (ICP-Brasil)" : ""}, válido até ${new Date(r.certificado.valido_ate).toLocaleDateString("pt-BR")}.`);
      setSenha("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para assinar com o certificado.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <Cartao
      titulo="Certificado digital"
      texto={
        <>
          Use o seu certificado <b>A1</b> (arquivo .pfx ou .p12) e a senha dele. A assinatura é feita <b>aqui no seu aparelho</b>: o arquivo e a senha não são enviados para ninguém, só a assinatura
          pronta.
        </>
      }
    >
      {ok ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {ok}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ring-slate-300 hover:bg-slate-50">
            <FileKey2 className="h-5 w-5 text-slate-500" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">{arquivo ? arquivo.name : "Escolher o arquivo do certificado"}</span>
            <input type="file" accept=".pfx,.p12,application/x-pkcs12" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha do certificado" autoComplete="off" className="w-full rounded-xl px-3 py-2.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-[#11273b] focus:outline-none" />
          <button type="button" disabled={!arquivo || !senha || ocupado} onClick={() => void assinar()} className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-semibold disabled:opacity-50 ${AZUL}`}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} Assinar com o certificado
          </button>
        </div>
      )}
      <Erro texto={erro} />
      <Botoes onVoltar={onVoltar} onSeguir={onPronto} pode={!!ok} />
    </Cartao>
  );
}

function EtapaConfirmar({ token, canais, onAssinou, onVoltar }: { token: string; canais: { zap: string | null; email: string | null }; onAssinou: () => void; onVoltar: () => void }) {
  const [gps, setGps] = useState<"pedindo" | "ok" | "negado" | "sem">("pedindo");
  const [destino, setDestino] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [concordo, setConcordo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

  // localização do aparelho (opcional: sem ela, fica a cidade pelo IP)
  useEffect(() => {
    if (!navigator.geolocation) return void Promise.resolve().then(() => setGps("sem"));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps("ok");
        void salvarGpsAction(token, { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy ?? null });
      },
      () => setGps("negado"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  }, [token]);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function enviar(canal: "zap" | "email") {
    setOcupado(true);
    setErro(null);
    const r = await pedirCodigoAction(token, canal);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    setDestino(r.destino);
    setEspera(60);
  }
  async function assinar() {
    setOcupado(true);
    setErro(null);
    const r = await assinarAction(token, codigo);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    onAssinou();
  }

  return (
    <Cartao titulo="Confirmar e assinar" texto="Para confirmar que é você, mandamos um código de 6 dígitos.">
      <p className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
        {gps === "pedindo" ? "Pedindo a sua localização (opcional)…" : gps === "ok" ? "Localização registrada." : "Sem localização do aparelho: fica registrada a cidade pela internet."}
      </p>
      {!destino ? (
        <>
          <p className="text-sm font-medium">Para onde mandamos o código?</p>
          <div className="mt-2 flex flex-col gap-2">
            {canais.zap && (
              <button type="button" disabled={ocupado} onClick={() => void enviar("zap")} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-60 ${AZUL}`}>
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp {canais.zap}
              </button>
            )}
            {canais.email && (
              <button type="button" disabled={ocupado} onClick={() => void enviar("email")} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ring-slate-300 disabled:opacity-60">
                <Mail className="h-4 w-4" aria-hidden /> E-mail {canais.email}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            Mandamos o código para o seu <b>{destino}</b>. Ele vale por 10 minutos.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              aria-label="Código de 6 dígitos"
              className="w-36 rounded-xl px-3 py-2.5 text-center font-mono text-xl tracking-[0.3em] ring-1 ring-slate-300 focus:ring-2 focus:ring-[#11273b] focus:outline-none"
            />
            <button type="button" disabled={espera > 0 || ocupado} onClick={() => setDestino(null)} className="text-sm text-slate-500 underline-offset-2 hover:underline disabled:no-underline disabled:opacity-60">
              {espera > 0 ? `Reenviar em ${espera}s` : "Reenviar / trocar"}
            </button>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#11273b]" />
            Li a ata e concordo com o seu conteúdo. Assino eletronicamente, com este código, a versão que li.
          </label>
        </>
      )}
      <Erro texto={erro} />
      <Botoes onVoltar={onVoltar} onSeguir={() => void assinar()} ocupado={ocupado} pode={!!destino && codigo.length === 6 && concordo} rotulo="Assinar a ata" />
    </Cartao>
  );
}

function Motivo({ token, tipo, onVoltar, onEnviou }: { token: string; tipo: "corrigir" | "recusar"; onVoltar: () => void; onEnviou: () => void }) {
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function enviar() {
    if (tipo === "recusar" && !confirm("Recusar assinar esta ata? O escritório será avisado.")) return;
    setOcupado(true);
    setErro(null);
    const r = tipo === "corrigir" ? await pedirCorrecaoAction(token, texto) : await recusarAction(token, texto);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    onEnviou();
  }
  return (
    <div>
      <label className="text-sm font-medium" htmlFor="motivo">
        {tipo === "corrigir" ? "O que precisa ser corrigido?" : "Por que você não vai assinar?"}
      </label>
      <textarea
        id="motivo"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={tipo === "corrigir" ? "Ex.: no item 3, o valor combinado foi R$ 45 mil, não R$ 35 mil." : "Ex.: não concordo com o que foi registrado sobre o prazo."}
        className="mt-1.5 w-full rounded-xl px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-[#11273b] focus:outline-none"
      />
      <Erro texto={erro} />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={texto.trim().length < 3 || ocupado}
          onClick={() => void enviar()}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${tipo === "recusar" ? "bg-red-700" : "bg-[#11273b]"}`}
        >
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : tipo === "recusar" ? <X className="h-4 w-4" aria-hidden /> : null}
          {tipo === "corrigir" ? "Enviar pedido de correção" : "Recusar assinatura"}
        </button>
        <button type="button" onClick={onVoltar} className="text-sm text-slate-500 hover:underline">
          Voltar
        </button>
      </div>
    </div>
  );
}

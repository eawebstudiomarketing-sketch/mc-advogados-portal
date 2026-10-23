"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Loader2, Mail, MessageCircle, PenLine, ShieldCheck } from "lucide-react";
import { AtaDocumento } from "@/components/atas/ata-documento";
import type { BlocoAta, DadosAta } from "@/lib/atas/formato";
import { assinarAction, pedirCodigoAction, pedirCorrecaoAction } from "./actions";

type Estado = "pendente" | "assinei" | "concluida" | "travada";

export function AssinarApp({
  token,
  nome,
  dados,
  blocos,
  estado,
  assineiEm,
  canais,
  signatarios,
  hash,
}: {
  token: string;
  nome: string;
  dados: DadosAta;
  blocos: BlocoAta[];
  estado: Estado;
  assineiEm: string | null;
  canais: { zap: string | null; email: string | null };
  signatarios: { nome: string; assinou: boolean }[];
  hash: string | null;
}) {
  const router = useRouter();
  const [painel, setPainel] = useState<null | "assinar" | "corrigir">(null);
  const primeiro = nome.split(/\s+/)[0];
  const pdf = `/assinar/${token}/pdf`;

  return (
    <main className="min-h-screen bg-[#f4f2ee] pb-40 text-[#1b1f24]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-3 px-4 py-3">
          <p className="text-[13px] font-bold tracking-wide">MC ADVOGADOS</p>
          <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            <Download className="h-4 w-4" aria-hidden /> Baixar PDF
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-[760px] px-4 pt-6">
        {estado === "concluida" ? (
          <Faixa cor="verde" icone={<CheckCircle2 className="h-5 w-5" aria-hidden />} titulo="Ata assinada por todos">
            O PDF assinado, com o registro das assinaturas, está no botão <b>Baixar PDF</b>.
          </Faixa>
        ) : estado === "assinei" ? (
          <Faixa cor="verde" icone={<CheckCircle2 className="h-5 w-5" aria-hidden />} titulo={`Você assinou${assineiEm ? ` em ${assineiEm}` : ""}`}>
            Falta a assinatura de {signatarios.filter((s) => !s.assinou).map((s) => s.nome).join(", ") || "outra pessoa"}. Quando todos assinarem, você recebe a cópia final.
          </Faixa>
        ) : estado === "travada" ? (
          <Faixa cor="amarelo" icone={<ShieldCheck className="h-5 w-5" aria-hidden />} titulo="Link travado">
            Houve muitas tentativas com código errado. Peça um novo link ao escritório.
          </Faixa>
        ) : (
          <div>
            <h1 className="text-xl font-semibold">Olá, {primeiro}!</h1>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-600">
              Confira a ata abaixo. Se estiver tudo certo, clique em <b>Assinar</b>: enviamos um código de 6 dígitos para confirmar que é você. Se algo estiver errado, use <b>Pedir correção</b>.
            </p>
          </div>
        )}
        {signatarios.length > 1 && (
          <ul className="mt-4 flex flex-wrap gap-2 text-[13px]">
            {signatarios.map((s, i) => (
              <li key={i} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${s.assinou ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-slate-600 ring-slate-200"}`}>
                {s.assinou ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <PenLine className="h-3.5 w-3.5" aria-hidden />}
                {s.nome} · {s.assinou ? "assinou" : "falta assinar"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 px-2 sm:px-4">
        <AtaDocumento dados={dados} blocos={blocos} />
        {hash && <p className="mx-auto mt-3 max-w-[760px] px-2 font-mono text-[10.5px] break-all text-slate-400">Impressão digital do documento: {hash}</p>}
      </div>

      {estado === "pendente" && (
        <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-[760px] px-4 py-3">
            {painel === "assinar" ? (
              <Assinar token={token} canais={canais} onVoltar={() => setPainel(null)} onAssinou={() => router.refresh()} />
            ) : painel === "corrigir" ? (
              <Corrigir token={token} onVoltar={() => setPainel(null)} onEnviou={() => router.refresh()} />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button type="button" onClick={() => setPainel("assinar")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#11273b] px-5 py-3 text-[15px] font-semibold text-white hover:bg-[#091827]">
                  <PenLine className="h-4 w-4" aria-hidden /> Assinar
                </button>
                <button type="button" onClick={() => setPainel("corrigir")} className="rounded-xl px-5 py-3 text-[15px] text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">
                  Pedir correção
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Faixa({ cor, icone, titulo, children }: { cor: "verde" | "amarelo"; icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ring-1 ${cor === "verde" ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
      <span className="mt-0.5 shrink-0">{icone}</span>
      <div>
        <p className="font-semibold">{titulo}</p>
        <p className="mt-0.5 text-sm leading-relaxed opacity-90">{children}</p>
      </div>
    </div>
  );
}

function Assinar({ token, canais, onVoltar, onAssinou }: { token: string; canais: { zap: string | null; email: string | null }; onVoltar: () => void; onAssinou: () => void }) {
  const [destino, setDestino] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [concordo, setConcordo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

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
    <div>
      {!destino ? (
        <>
          <p className="text-sm font-medium">Para onde mandamos o código?</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            {canais.zap && (
              <button type="button" disabled={ocupado} onClick={() => void enviar("zap")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#11273b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp {canais.zap}
              </button>
            )}
            {canais.email && (
              <button type="button" disabled={ocupado} onClick={() => void enviar("email")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ring-slate-300 disabled:opacity-60">
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
            Li a ata e concordo com o seu conteúdo. Assino eletronicamente com este código.
          </label>
          <button
            type="button"
            disabled={codigo.length !== 6 || !concordo || ocupado}
            onClick={() => void assinar()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#11273b] px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} Assinar a ata
          </button>
        </>
      )}
      {erro && <p className="mt-2 text-sm text-red-700" role="alert">{erro}</p>}
      <button type="button" onClick={onVoltar} className="mt-2 text-sm text-slate-500 hover:underline">
        Voltar
      </button>
    </div>
  );
}

function Corrigir({ token, onVoltar, onEnviou }: { token: string; onVoltar: () => void; onEnviou: () => void }) {
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function enviar() {
    setOcupado(true);
    setErro(null);
    const r = await pedirCorrecaoAction(token, texto);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    onEnviou();
  }
  return (
    <div>
      <label className="text-sm font-medium" htmlFor="correcao">
        O que precisa ser corrigido?
      </label>
      <textarea
        id="correcao"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Ex.: no item 3, o valor combinado foi R$ 45 mil, não R$ 35 mil."
        className="mt-1.5 w-full rounded-xl px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-[#11273b] focus:outline-none"
      />
      {erro && <p className="mt-1 text-sm text-red-700" role="alert">{erro}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={texto.trim().length < 3 || ocupado} onClick={() => void enviar()} className="inline-flex items-center gap-2 rounded-xl bg-[#11273b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Enviar pedido de correção
        </button>
        <button type="button" onClick={onVoltar} className="text-sm text-slate-500 hover:underline">
          Voltar
        </button>
      </div>
    </div>
  );
}

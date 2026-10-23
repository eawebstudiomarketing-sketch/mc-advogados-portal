"use client";

import { useState } from "react";
import { CheckCircle2, FileSearch, Loader2, ShieldCheck, XCircle } from "lucide-react";
import type { Validacao } from "@/lib/atas/assinatura";
import { validarAction } from "./actions";

export function ValidarApp({ codigoInicial }: { codigoInicial: string }) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Validacao | null | undefined>(undefined);
  const [porArquivo, setPorArquivo] = useState(false);

  async function conferir(entrada: { codigo?: string; hash?: string }) {
    setOcupado(true);
    setResultado(undefined);
    setPorArquivo(!!entrada.hash);
    setResultado(await validarAction(entrada));
    setOcupado(false);
  }
  async function arquivo(f: File) {
    const resumo = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
    const hash = [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
    await conferir({ hash });
  }

  return (
    <div className="mt-6 space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void conferir({ codigo });
        }}
        className="flex gap-2"
      >
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="Código (ex.: K7QF-3M9P)"
          maxLength={9}
          aria-label="Código de validação"
          className="flex-1 rounded-xl bg-white px-3 py-3 font-mono tracking-widest ring-1 ring-slate-300 focus:ring-2 focus:ring-[#11273b] focus:outline-none"
        />
        <button type="submit" disabled={codigo.replace(/[^A-Z0-9]/g, "").length !== 8 || ocupado} className="rounded-xl bg-[#11273b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
          Validar
        </button>
      </form>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-600 hover:border-[#11273b]">
        <FileSearch className="h-5 w-5" aria-hidden /> Ou escolha o PDF para conferir
        <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && void arquivo(e.target.files[0])} />
      </label>

      {ocupado && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Conferindo…
        </p>
      )}
      {resultado === null && (
        <div className="flex gap-3 rounded-2xl bg-red-50 p-4 text-red-900 ring-1 ring-red-200">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Documento não encontrado</p>
            <p className="mt-0.5 text-sm">{porArquivo ? "Este arquivo não é uma ata assinada pelo portal, ou foi alterado depois da assinatura." : "Confira o código: ele está no rodapé do PDF."}</p>
          </div>
        </div>
      )}
      {resultado && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className={`flex gap-3 rounded-xl p-3 ${resultado.situacao === "Assinada por todos" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {resultado.situacao === "Assinada por todos" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
            <div>
              <p className="font-semibold">{resultado.situacao}</p>
              {porArquivo && (
                <p className="mt-0.5 text-sm">
                  {resultado.confere === "final" ? "O arquivo é exatamente o PDF final assinado." : "O arquivo é a versão enviada para assinatura (o conteúdo assinado), sem a página de registro."}
                </p>
              )}
            </div>
          </div>
          <p className="mt-4 font-medium">{resultado.documento}</p>
          {resultado.codigo && <p className="text-sm text-slate-500">Código de validação {resultado.codigo}</p>}
          <ul className="mt-4 divide-y divide-slate-100">
            {resultado.assinaturas.map((a, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
                {a.quando ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden />}
                <span>
                  <b>{a.nome}</b> <span className="text-slate-500">· {a.papel}</span>
                  <span className="block text-slate-500">{a.quando ? `Assinou em ${a.quando} · ${a.autenticacoes.join(", ")}` : "Ainda não assinou"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

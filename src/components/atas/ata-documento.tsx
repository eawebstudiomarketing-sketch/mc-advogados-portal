"use client";

import { identificacao, NOTA_INTERNA, type BlocoAta, type DadosAta } from "@/lib/atas/formato";

// A ata na tela, no mesmo desenho do PDF (folha branca). Na revisão, o minuto
// de cada item vira um botão que leva o player até aquele ponto.
export function AtaDocumento({ dados, blocos, onMinuto }: { dados: DadosAta; blocos: BlocoAta[]; onMinuto?: (hms: string) => void }) {
  const minuto = (m: string | null) =>
    m && onMinuto ? (
      <button type="button" onClick={() => onMinuto(m)} className="ml-1.5 rounded bg-slate-100 px-1 py-px align-middle font-mono text-[10.5px] text-slate-500 hover:bg-slate-200 hover:text-slate-800" data-tip="Ouvir este trecho">
        {m}
      </button>
    ) : null;
  return (
    <article className="mx-auto w-full max-w-[760px] rounded-xl bg-white px-6 py-8 text-[14px] leading-relaxed text-[#1b1f24] shadow-sm ring-1 ring-black/5 sm:px-12 sm:py-12">
      <p className="text-[13px] font-bold tracking-wide">MC ADVOGADOS</p>
      <h1 className="mt-2 text-2xl font-bold sm:text-[26px]">{dados.titulo}</h1>
      <hr className="mt-4 mb-2 border-t-[1.5px] border-[#1b1f24]" />
      <h2 className="mt-5 mb-2 border-b border-slate-200 pb-1.5 text-[15px] font-bold">1. Identificação da reunião</h2>
      {identificacao(dados).map((l) => (
        <p key={l.rotulo} className="mb-0.5">
          <b>{l.rotulo}:</b> {l.texto}
        </p>
      ))}
      {blocos.map((b, i) => {
        if (b.tipo === "secao")
          return (
            <div key={i}>
              <h2 className="mt-6 mb-2 border-b border-slate-200 pb-1.5 text-[15px] font-bold">
                {b.numero}. {b.texto}
              </h2>
              {b.interna && <p className="mb-2 text-[12.5px] text-slate-500 italic">{NOTA_INTERNA}</p>}
            </div>
          );
        if (b.tipo === "subsecao")
          return (
            <h3 key={i} className="mt-3 mb-1 text-[13.5px] font-bold">
              {b.texto}
            </h3>
          );
        if (b.tipo === "item")
          return (
            <p key={i} className="mb-1.5 flex gap-2 pl-2">
              <span aria-hidden>•</span>
              <span>
                {b.texto}
                {minuto(b.minuto)}
              </span>
            </p>
          );
        if (b.tipo === "numerado")
          return (
            <p key={i} className="mt-3 mb-0.5 font-bold">
              {b.texto}
              {minuto(b.minuto)}
            </p>
          );
        if (b.tipo === "campo")
          return /^prioridade$/i.test(b.rotulo) ? (
            <p key={i} className="mb-0.5 pl-4 text-[12.5px] text-slate-500">
              {b.rotulo}: {b.texto}
            </p>
          ) : (
            <p key={i} className="mb-0.5 pl-4">
              <b>{b.rotulo}:</b> {b.texto}
              {minuto(b.minuto)}
            </p>
          );
        return (
          <p key={i} className="mb-2">
            {b.texto}
            {minuto(b.minuto)}
          </p>
        );
      })}
    </article>
  );
}

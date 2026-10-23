import type { Metadata } from "next";
import { ValidarApp } from "./validar-app";

export const metadata: Metadata = { title: "Validar documento — MC Advogados", description: "Confira se uma ata assinada pelo Portal MC Advogados é autêntica." };

export default async function ValidarPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  return (
    <main className="min-h-screen bg-[#f4f2ee] px-4 py-10 text-[#1b1f24]">
      <div className="mx-auto max-w-xl">
        <p className="text-[13px] font-bold tracking-wide">MC ADVOGADOS</p>
        <h1 className="mt-3 text-2xl font-semibold">Validar documento</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-600">
          Confira se uma ata assinada pelo Portal MC Advogados é autêntica: digite o código de validação que está no rodapé do PDF ou escolha o arquivo. O arquivo é conferido no seu aparelho e não é
          enviado.
        </p>
        <ValidarApp codigoInicial={c ?? ""} />
      </div>
    </main>
  );
}

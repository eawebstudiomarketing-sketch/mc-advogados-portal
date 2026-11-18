"use client";

import { useRef, useState } from "react";
import { calcularCusto, reais, type Regime, type ResultadoCusto } from "@/lib/iscas/custo";
import { BotaoOuro, BotaoZap, CaixaLead, CAMPO, Moldura, OURO, Titulo, useIsca } from "../comum";

const SLUG = "isca-custo";

// "1.234,56" → 1234.56
const numero = (v: string) => Number(v.replace(/[^\d,]/g, "").replace(",", ".")) || 0;
const mascaraReais = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 9);
  if (!d) return "";
  return (Number(d) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function CampoReais({ valor, onChange, placeholder, grande }: { valor: string; onChange: (v: string) => void; placeholder: string; grande?: boolean }) {
  return (
    <div className="relative">
      <span className={`pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 font-bold text-white/45 ${grande ? "text-xl" : ""}`}>R$</span>
      <input
        value={valor}
        onChange={(e) => onChange(mascaraReais(e.target.value))}
        inputMode="numeric"
        placeholder={placeholder}
        className={`${CAMPO} ${grande ? "h-16 pl-14 text-xl font-bold" : "h-14 pl-12"}`}
      />
    </div>
  );
}

export function IscaCusto() {
  const { evento, comecou, enviarLead, armadilha } = useIsca(SLUG);
  const [salario, setSalario] = useState("");
  const [regime, setRegime] = useState<Regime | "">("");
  const [beneficios, setBeneficios] = useState(false);
  const [vt, setVt] = useState("");
  const [alimentacao, setAlimentacao] = useState("");
  const [saude, setSaude] = useState("");
  const [res, setRes] = useState<ResultadoCusto | null>(null);
  const [liberado, setLiberado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  const jaComecou = useRef(false);

  function calcular(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const s = numero(salario);
    if (s < 100) return setErro("Digite o salário do funcionário.");
    if (!regime) return setErro("Escolha como a empresa paga impostos.");
    if (!jaComecou.current) {
      jaComecou.current = true;
      comecou();
    }
    setRes(calcularCusto({ salario: s, regime, vt: numero(vt), alimentacao: numero(alimentacao), saude: numero(saude) }));
    requestAnimationFrame(() => resultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function lead(nome: string, telefone: string) {
    if (!res) return "Faça o cálculo primeiro.";
    const resumo = [
      `Custo mensal: ${reais(res.total)} (${res.multiplicador.toFixed(2).replace(".", ",")}x o salário) · anual: ${reais(res.anual)}`,
      ...res.itens.map((i) => `• ${i.rotulo}: ${reais(i.valor)}`),
    ].join("\n");
    const falha = await enviarLead({
      salario: salario,
      regime: regime === "simples" ? "Simples Nacional" : "Lucro Presumido ou Real",
      resultado: resumo,
      nome,
      telefone,
    });
    if (!falha) setLiberado(true);
    return falha;
  }

  const pctSalario = res ? Math.round((res.itens[0].valor / res.total) * 100) : 0;

  return (
    <Moldura>
      <Titulo antes={<>Quanto custa um funcionário</>} destaque="de verdade" depois="?" sub="O salário é só uma parte. Veja em segundos quanto ele pesa no caixa da empresa." />

      <form onSubmit={calcular} className="mt-8 space-y-3">
        <CampoReais valor={salario} onChange={setSalario} placeholder="Salário na carteira" grande />
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["simples", "Simples Nacional"],
              ["lucro", "Lucro Presumido ou Real"],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              type="button"
              onClick={() => setRegime(v)}
              className={`min-h-14 rounded-2xl border-2 px-3 py-2 text-[15px] font-bold leading-tight transition ${regime === v ? "border-[#c9a557] bg-[#c9a557]/15 text-white" : "border-white/12 bg-white/[0.06] text-white/70"}`}
            >
              {r}
            </button>
          ))}
        </div>
        {!beneficios ? (
          <button type="button" onClick={() => setBeneficios(true)} className="w-full py-1 text-[15px] font-bold" style={{ color: OURO }}>
            + Incluir vale-transporte, alimentação ou plano de saúde
          </button>
        ) : (
          <div className="space-y-3 rounded-2xl bg-white/[0.04] p-3">
            <CampoReais valor={vt} onChange={setVt} placeholder="Passagens no mês (vale-transporte)" />
            <CampoReais valor={alimentacao} onChange={setAlimentacao} placeholder="Vale-refeição/alimentação no mês" />
            <CampoReais valor={saude} onChange={setSaude} placeholder="Plano de saúde (parte da empresa)" />
          </div>
        )}
        <input ref={armadilha} name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <BotaoOuro>{res ? "Calcular de novo" : "Calcular custo"}</BotaoOuro>
        {erro && <p className="text-center text-sm text-[#ff8a80]">{erro}</p>}
        {!res && <p className="pt-1 text-center text-[13px] text-white/45">Grátis · o resultado aparece na hora</p>}
      </form>

      {res && (
        <div ref={resultadoRef} className="mt-10 scroll-mt-4">
          <section className="rounded-[28px] bg-white px-5 py-7 text-center text-[#0b1626] shadow-2xl">
            <p className="text-[15px] font-bold text-[#0b1626]/55">Esse funcionário custa para a empresa</p>
            <p className="mt-1 font-[family-name:var(--font-playfair)] text-[2.9rem] leading-none font-extrabold tracking-tight">{reais(res.total)}</p>
            <p className="mt-1 text-[15px] text-[#0b1626]/55">por mês</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full bg-[#ef5a4f] px-3 py-1 text-[14px] font-black text-white">{res.multiplicador.toFixed(1).replace(".", ",")}x o salário</span>
              <span className="rounded-full bg-[#f3f1ec] px-3 py-1 text-[14px] font-bold">{reais(res.anual)} por ano</span>
            </div>

            {/* salário x o resto */}
            <div className="mt-6 text-left">
              <div className="flex h-4 overflow-hidden rounded-full">
                <div className="h-full bg-[#0b1626]" style={{ width: `${pctSalario}%` }} />
                <div className="h-full" style={{ width: `${100 - pctSalario}%`, background: OURO }} />
              </div>
              <div className="mt-2 flex justify-between text-[13px] font-bold">
                <span>Salário {pctSalario}%</span>
                <span style={{ color: "#9a7a2f" }}>Encargos e reservas {100 - pctSalario}%</span>
              </div>
            </div>

            <div className="relative mt-6 text-left">
              <p className="mb-2 text-[13px] font-bold tracking-[0.12em] text-[#0b1626]/50 uppercase">Item por item</p>
              <ul className={`space-y-1.5 transition ${liberado ? "" : "pointer-events-none blur-[6px] select-none"}`} aria-hidden={!liberado}>
                {res.itens.map((i) => (
                  <li key={i.rotulo} className="rounded-2xl bg-[#f3f1ec] px-4 py-3">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-bold">{i.rotulo}</span>
                      <span className="shrink-0 font-black">{reais(i.valor)}</span>
                    </span>
                    {liberado && <span className="mt-0.5 block text-[13px] text-[#0b1626]/55">{i.dica}</span>}
                  </li>
                ))}
              </ul>
              {!liberado && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-[#0b1626] px-4 py-2 text-[14px] font-bold text-white shadow-lg">🔒 Libere abaixo, é grátis</span>
                </div>
              )}
            </div>
          </section>

          {!liberado ? (
            <CaixaLead
              titulo="Veja a conta completa."
              texto="Libere o cálculo item por item agora. Um especialista também te mostra no WhatsApp como reduzir esse custo dentro da lei."
              botao="Liberar o cálculo completo"
              pronto={() => "O cálculo completo já está liberado acima. Em breve um especialista te chama no WhatsApp."}
              onEnviar={lead}
            />
          ) : (
            <div className="mt-5 rounded-[28px] bg-[#41c28a]/12 p-5 text-center text-[15px] leading-snug text-white/80">
              Cálculo liberado acima. Em breve um especialista te chama no WhatsApp para mostrar como reduzir esse custo dentro da lei.
            </div>
          )}
          <BotaoZap mensagem="Olá! Fiz o cálculo de custo de funcionário no site de vocês e quero entender como reduzir esse custo." onClick={() => evento(["Contact", "WhatsAppClick"], true)} />
        </div>
      )}
    </Moldura>
  );
}

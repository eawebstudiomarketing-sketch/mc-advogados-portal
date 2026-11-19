"use client";

import { useRef, useState } from "react";
import { dataCurta, fmtHoras, montarEscala, NOMES_DIA, PRIMEIRO_DIA, SEMANAS, type ResultadoEscala } from "@/lib/iscas/escala";
import { BotaoOuro, BotaoZap, CaixaLead, CAMPO, COR_NIVEL, Medidor, Moldura, OURO, Titulo, useIsca } from "../comum";

const SLUG = "isca-escala";

function Contador({ rotulo, valor, onChange, min = 0, max = 40 }: { rotulo: string; valor: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const botao = "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-2xl font-black text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-white/12 bg-white/[0.06] py-2 pr-2 pl-5">
      <span className="text-[16px] leading-tight text-white/85">{rotulo}</span>
      <span className="flex items-center gap-2">
        <button type="button" className={botao} onClick={() => onChange(Math.max(min, valor - 1))} disabled={valor <= min} aria-label={`Menos: ${rotulo}`}>
          −
        </button>
        <span className="w-9 text-center text-2xl font-black tabular-nums" aria-live="polite">
          {valor}
        </span>
        <button type="button" className={botao} onClick={() => onChange(Math.min(max, valor + 1))} disabled={valor >= max} aria-label={`Mais: ${rotulo}`}>
          +
        </button>
      </span>
    </div>
  );
}

function Semana({ res, w }: { res: ResultadoEscala; w: number }) {
  const dias = res.dias.slice(w * 7, w * 7 + 7);
  return (
    <table className="w-full table-fixed border-separate border-spacing-[3px] text-[12px]">
      <thead>
        <tr>
          <th className="w-[74px] text-left text-[11px] font-bold text-[#0b1626]/45">
            {dataCurta(dias[0].data)} a {dataCurta(dias[6].data)}
          </th>
          {dias.map((d) => (
            <th key={d.data} className="font-bold">
              <span className="block">{NOMES_DIA[d.dow]}</span>
              <span className={`block text-[10px] ${d.feriado ? "text-[#ef5a4f]" : "text-[#0b1626]/45"}`}>{d.feriado ? "feriado" : dataCurta(d.data)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {res.pessoas.map((p, i) => (
          <tr key={p.nome}>
            <td className="truncate pr-1 font-bold text-[#0b1626]/70">
              {p.sexo === "f" ? "Mulher" : "Homem"} {i + 1}
            </td>
            {dias.map((d, k) => {
              const t = res.grade[i][w * 7 + k];
              return (
                <td
                  key={d.data}
                  className={`h-7 rounded-md text-center font-black ${!d.aberto ? "bg-[#f3f1ec] text-[#0b1626]/30" : t ? "bg-[#0b1626] text-white" : "text-[#0b1626]"}`}
                  style={d.aberto && !t ? { background: "rgba(201,165,87,0.35)" } : undefined}
                  title={!d.aberto ? "Fechado" : t ? "Trabalha" : "Folga"}
                >
                  {!d.aberto ? "·" : t ? "T" : "F"}
                </td>
              );
            })}
          </tr>
        ))}
        <tr>
          <td className="pt-1 text-[11px] font-bold text-[#0b1626]/45">Trabalham</td>
          {dias.map((d) => (
            <td key={d.data} className="pt-1 text-center text-[11px] font-black" style={{ color: d.aberto && d.trabalham < d.precisa ? COR_NIVEL.alto : "rgba(11,22,38,.55)" }}>
              {d.aberto ? d.trabalham : "–"}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export function IscaEscala() {
  const { evento, comecou, enviarLead, armadilha } = useIsca(SLUG);
  const [funcionarios, setFuncionarios] = useState(6);
  const [mulheres, setMulheres] = useState(3);
  const [abertos, setAbertos] = useState([true, true, true, true, true, true, false]);
  const [abre, setAbre] = useState("08:00");
  const [fecha, setFecha] = useState("18:00");
  const [porDia, setPorDia] = useState(4);
  const [res, setRes] = useState<ResultadoEscala | null>(null);
  const [liberado, setLiberado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  const jaComecou = useRef(false);

  function montar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!abertos.some(Boolean)) return setErro("Marque pelo menos um dia em que a empresa abre.");
    if (!abre || !fecha) return setErro("Preencha o horário de funcionamento.");
    if (!jaComecou.current) {
      jaComecou.current = true;
      comecou();
    }
    setRes(montarEscala({ funcionarios, mulheres: Math.min(mulheres, funcionarios), abertos, abre, fecha, minimo: porDia }));
    requestAnimationFrame(() => resultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function lead(nome: string, telefone: string) {
    if (!res) return "Monte a escala primeiro.";
    const dias = NOMES_DIA.filter((_, i) => abertos[i]).join(", ");
    const resumo = [
      `${res.veredito}. ${res.explicacao}`,
      `Precisa na 5x2: ${res.precisaAgora} · na 6x1: ${res.precisaAntes} · tem: ${funcionarios}`,
      ...res.verificacoes.map((v) => `${v.ok ? "✓" : "✗"} ${v.texto}`),
    ].join("\n");
    const falha = await enviarLead({
      equipe: `${funcionarios} funcionários (${Math.min(mulheres, funcionarios)} mulheres) · ${porDia} por dia`,
      funcionamento: `${dias} · ${abre} às ${fecha}`,
      resultado: resumo,
      nome,
      telefone,
    });
    if (!falha) setLiberado(true);
    return falha;
  }

  return (
    <Moldura>
      <Titulo antes={<>Sua escala fecha na</>} destaque="5x2" depois="?" sub="Duas folgas por semana e 42 horas a partir de 16/12. Monte a escala da sua equipe em segundos." />

      <form onSubmit={montar} className="mt-8 space-y-3">
        <Contador rotulo="Funcionários" valor={funcionarios} onChange={(v) => {
            setFuncionarios(v);
            setMulheres((m) => Math.min(m, v));
            setPorDia((p) => Math.min(p, v));
          }} min={1} />
        <Contador rotulo="Quantas são mulheres" valor={Math.min(mulheres, funcionarios)} onChange={setMulheres} max={funcionarios} />
        <Contador rotulo="Pessoas trabalhando por dia" valor={porDia} onChange={setPorDia} min={1} max={funcionarios} />

        <fieldset className="rounded-2xl border-2 border-white/12 bg-white/[0.06] p-4">
          <legend className="sr-only">Dias em que a empresa abre</legend>
          <p className="text-[16px] text-white/85">Dias em que a empresa abre</p>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {NOMES_DIA.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={abertos[i]}
                onClick={() => setAbertos((a) => a.map((x, k) => (k === i ? !x : x)))}
                className={`h-11 rounded-xl text-[13px] font-black transition active:scale-95 ${abertos[i] ? "text-[#07111f]" : "bg-white/[0.06] text-white/45"}`}
                style={abertos[i] ? { background: OURO } : undefined}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block pl-1 text-[13px] text-white/55">Abre às</span>
            <input type="time" value={abre} onChange={(e) => setAbre(e.target.value)} className={`${CAMPO} h-14 [color-scheme:dark]`} />
          </label>
          <label className="block">
            <span className="mb-1 block pl-1 text-[13px] text-white/55">Fecha às</span>
            <input type="time" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} h-14 [color-scheme:dark]`} />
          </label>
        </div>

        <input ref={armadilha} name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <BotaoOuro>{res ? "Montar de novo" : "Montar minha escala"}</BotaoOuro>
        {erro && <p className="text-center text-sm text-[#ff8a80]">{erro}</p>}
        {!res && <p className="pt-1 text-center text-[13px] text-white/45">Grátis · a escala aparece na hora</p>}
      </form>

      {res && (
        <div ref={resultadoRef} className="mt-10 scroll-mt-4">
          <section className="rounded-[28px] bg-white px-4 py-7 text-[#0b1626] shadow-2xl sm:px-5">
            <div className="text-center">
              <Medidor nivel={res.nivel} />
              <p className="mt-1 font-[family-name:var(--font-playfair)] text-[2.1rem] leading-tight font-extrabold" style={{ color: res.nivel === "baixo" ? "#1f8a5b" : res.nivel === "medio" ? "#a8741a" : COR_NIVEL.alto }}>
                {res.veredito}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[15px] leading-snug text-[#0b1626]/70">{res.explicacao}</p>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {[
                ["Na 6x1", res.precisaAntes],
                ["Na 5x2", res.precisaAgora],
                ["Você tem", funcionarios],
              ].map(([r, v], i) => (
                <div key={r} className={`rounded-2xl px-2 py-3 ${i === 1 ? "bg-[#0b1626] text-white" : "bg-[#f3f1ec]"}`}>
                  <p className="text-[12px] font-bold opacity-60">{r}</p>
                  <p className="text-[1.7rem] leading-none font-black tabular-nums">{v}</p>
                  <p className="text-[11px] opacity-60">{i < 2 ? "pessoas no mínimo" : "funcionários"}</p>
                </div>
              ))}
            </div>

            <div className="mt-7">
              <p className="mb-2 text-[13px] font-bold tracking-[0.12em] text-[#0b1626]/50 uppercase">Sua escala · primeira semana</p>
              <Semana res={res} w={0} />
              <p className="mt-2 text-[12px] text-[#0b1626]/50">
                T = trabalha ({fmtHoras(8.4)}) · F = folga · jornada de 42 h por semana
              </p>
            </div>

            <div className="relative mt-6">
              <p className="mb-2 text-[13px] font-bold tracking-[0.12em] text-[#0b1626]/50 uppercase">O mês inteiro e a conferência</p>
              <div className={`space-y-5 transition ${liberado ? "" : "pointer-events-none max-h-72 overflow-hidden blur-[6px] select-none"}`} aria-hidden={!liberado}>
                {Array.from({ length: SEMANAS - 1 }, (_, k) => (
                  <Semana key={k} res={res} w={k + 1} />
                ))}
                <ul className="space-y-1.5">
                  {res.verificacoes.map((v) => (
                    <li key={v.texto} className="flex items-start gap-2 rounded-2xl bg-[#f3f1ec] px-4 py-3 text-[14px] font-bold">
                      <span style={{ color: v.ok ? "#1f8a5b" : COR_NIVEL.alto }} aria-hidden>
                        {v.ok ? "✓" : "✗"}
                      </span>
                      {v.texto}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1.5">
                  {res.dicas.map((d) => (
                    <li key={d} className="rounded-2xl border border-[#0b1626]/10 px-4 py-3 text-[14px] leading-snug text-[#0b1626]/75">
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
              {!liberado && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-[#0b1626] px-4 py-2 text-[14px] font-bold text-white shadow-lg">🔒 Libere abaixo, é grátis</span>
                </div>
              )}
            </div>
          </section>

          {!liberado ? (
            <CaixaLead
              titulo="Veja a escala do mês inteiro."
              texto={`Libere as ${SEMANAS} semanas a partir de ${dataCurta(PRIMEIRO_DIA)}, a conferência das regras e os pontos de atenção. Um especialista também confere a sua escala no WhatsApp antes de 16/12.`}
              botao="Liberar a escala completa"
              pronto={() => "A escala completa já está liberada acima. Em breve um especialista te chama no WhatsApp."}
              onEnviar={lead}
            />
          ) : (
            <div className="mt-5 rounded-[28px] bg-[#41c28a]/12 p-5 text-center text-[15px] leading-snug text-white/80">
              Escala liberada acima. Em breve um especialista te chama no WhatsApp para conferir com a convenção da sua categoria.
            </div>
          )}
          <BotaoZap mensagem="Olá! Montei a escala 5x2 no site de vocês e quero ajuda para adaptar a minha empresa." onClick={() => evento(["Contact", "WhatsAppClick"], true)} />
        </div>
      )}
    </Moldura>
  );
}

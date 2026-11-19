"use client";

import { useEffect, useRef, useState } from "react";
import { nomeClasse, SUGESTOES_RAMO } from "@/lib/iscas/ramos";
import { BotaoOuro, BotaoZap, CAMPO, COR_NIVEL, Medidor, Moldura, OURO, useIsca } from "../comum";

// v3 (19/11/2026, pedido do João): ramo digitado, texto mais completo, resultado no formato
// de PRÉVIA DO RELATÓRIO DE VIABILIDADE do portal (medidor + seções) e, no fim, só o botão
// "Falar com um especialista" (WhatsApp com o resumo da prévia). Sem formulário de contato.

type Parecida = { marca: string; classe: string; situacao: string; parecenca: number; processo: string; titular: string; deposito: string | null; apresentacao: string | null };
type Previa = {
  marca: string;
  ramo: string;
  risco: "baixo" | "medio" | "alto";
  parecidas: Parecida[];
  total: number;
  classes: string[];
  porClasse: { classe: string; total: number; maior: number }[];
  identicas: number;
  registradas: number;
};

const SLUG = "isca-marca";

const RISCO = {
  baixo: {
    rotulo: "Risco baixo",
    titulo: "Caminho livre, por enquanto.",
    texto: "Não apareceu ninguém usando nome igual ou muito parecido no seu ramo. É o melhor momento para pedir o registro, antes que alguém tenha a mesma ideia.",
    indeferimento: "Baixa: não há marca ativa parecida o bastante para barrar o pedido nas classes analisadas.",
    recomendacoes: [
      "Pedir o registro o quanto antes: a marca fica com quem pede primeiro.",
      "Registrar em todas as classes do que você vende ou pretende vender.",
      "Proteger também o logo, não só o nome.",
    ],
  },
  medio: {
    rotulo: "Risco médio",
    titulo: "Tem gente parecida no caminho.",
    texto: "Existem marcas com nome parecido no seu ramo. Dá para registrar, mas a forma de pedir (classe, descrição e apresentação da marca) faz toda a diferença.",
    indeferimento: "Moderada: as marcas parecidas podem ser usadas como motivo para negar o pedido ou gerar oposição dos donos.",
    recomendacoes: [
      "Avaliar um elemento a mais no nome ou no logo que deixe a marca mais distinta.",
      "Escolher com cuidado a classe e a descrição dos serviços para fugir do conflito.",
      "Conversar com um especialista antes de protocolar ou investir em fachada e embalagens.",
    ],
  },
  alto: {
    rotulo: "Risco alto",
    titulo: "Alguém chegou antes.",
    texto: "Já existe marca quase igual à sua no mesmo ramo. Do jeito que está, o pedido tende a ser negado, e usar o nome sem registro pode gerar notificação para trocar de nome.",
    indeferimento: "Alta: existe marca ativa quase idêntica na mesma classe, o que costuma levar ao indeferimento.",
    recomendacoes: [
      "Não investir mais no nome (fachada, site, embalagens) antes de uma análise.",
      "Estudar variações do nome que mantenham a sua identidade.",
      "Verificar se a marca anterior está realmente em uso: em alguns casos há saída.",
    ],
  },
} as const;

const PASSOS = ["Procurando nomes iguais…", "Comparando grafias e sons parecidos…", "Olhando os concorrentes do seu ramo…", "Montando o relatório…"];

const grau = (p: number) => (p >= 0.85 ? { t: "Quase idêntica", c: COR_NIVEL.alto } : p >= 0.65 ? { t: "Muito parecida", c: "#e39a22" } : { t: "Parecida", c: "#8a94a3" });
const situacaoTxt = (s: string) => (/vigor|deferido/i.test(s) ? "Já registrada" : "Pedido em andamento");
const conflito = (total: number, maior: number) =>
  maior >= 0.85 ? { t: "Conflito forte", c: COR_NIVEL.alto } : maior >= 0.65 ? { t: "Conflito moderado", c: "#e39a22" } : total > 0 ? { t: "Conflito fraco", c: "#8a94a3" } : { t: "Sem conflito aparente", c: COR_NIVEL.baixo };
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const cls = (c: string) => `Classe ${c.padStart(2, "0")}`;

function Secao({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="flex items-baseline gap-2 border-b border-[#0b1626]/10 pb-2 font-[family-name:var(--font-playfair)] text-[1.3rem] font-extrabold">
        <span className="text-[15px] font-black" style={{ color: OURO }}>
          {String(n).padStart(2, "0")}
        </span>
        {titulo}
      </h3>
      <div className="mt-3 text-[15px] leading-relaxed text-[#0b1626]/80">{children}</div>
    </section>
  );
}

export function IscaMarca() {
  const { api, evento, comecou, armadilha } = useIsca(SLUG, 2);
  const [marca, setMarca] = useState("");
  const [ramo, setRamo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [geradoEm, setGeradoEm] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);

  // enquanto procura, mostra o que está fazendo (passo a passo)
  useEffect(() => {
    if (!carregando) return;
    const t = setInterval(() => setPasso((p) => Math.min(p + 1, PASSOS.length - 1)), 750);
    return () => clearInterval(t);
  }, [carregando]);

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (marca.trim().length < 2) return setErro("Digite o nome da sua marca.");
    if (ramo.trim().length < 3) return setErro("Conte qual é o ramo do seu negócio.");
    setPrevia(null);
    setPasso(0);
    setCarregando(true);
    comecou();
    const inicio = Date.now();
    try {
      const r = await fetch("/api/ferramentas/marca", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marca, ramo, site: armadilha.current?.value ?? "" }) });
      const j = await r.json();
      // deixa o passo a passo aparecer (resposta rápida demais parece que não procurou)
      const falta = 2800 - (Date.now() - inicio);
      if (falta > 0) await new Promise((ok) => setTimeout(ok, falta));
      if (!r.ok) return setErro(j.erro ?? "Não deu certo agora. Tente de novo.");
      setPrevia(j as Previa);
      setGeradoEm(new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }));
      api({ eventos: [{ nome: "FormFieldComplete", pergunta: 1, campo: "marca" }] });
      requestAnimationFrame(() => resultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  const r = previa ? RISCO[previa.risco] : null;
  const mensagemZap = previa
    ? `Olá! Fiz a prévia da marca "${previa.marca}" (${previa.ramo}) no site de vocês e deu ${RISCO[previa.risco].rotulo.toLowerCase()}${previa.total ? `, com ${previa.total} marca(s) parecida(s)` : ""}. Quero falar com um especialista sobre o registro.`
    : "Olá! Quero falar com um especialista sobre o registro da minha marca.";
  const cliqueZap = () => evento(["Contact", "WhatsAppClick"], true);

  return (
    <Moldura>
      <h1 className="text-center font-[family-name:var(--font-playfair)] text-[2.7rem] leading-[1.02] font-extrabold tracking-tight sm:text-[3.4rem]">
        Sua marca
        <br />
        está <em style={{ color: OURO }}>livre</em>?
      </h1>
      <p className="mx-auto mt-4 max-w-md text-center text-[17px] leading-snug text-white/75">
        Digite o nome e o ramo do seu negócio. Em segundos você recebe uma prévia do relatório de viabilidade: quem já usa um nome parecido, o nível de risco e o que fazer antes de investir na marca.
      </p>

      <form onSubmit={consultar} className="mt-8 space-y-3">
        <input value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={60} placeholder="Nome da sua marca" className={`${CAMPO} h-16 text-center text-xl font-bold`} autoComplete="off" />
        <input
          value={ramo}
          onChange={(e) => setRamo(e.target.value)}
          maxLength={80}
          list="ramos-sugeridos"
          placeholder="Ramo do negócio (ex.: hamburgueria)"
          className={`${CAMPO} h-14`}
          autoComplete="off"
        />
        <datalist id="ramos-sugeridos">
          {SUGESTOES_RAMO.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <input ref={armadilha} name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <BotaoOuro disabled={carregando}>{carregando ? "Analisando…" : previa ? "Pesquisar outra marca" : "Ver a prévia do relatório"}</BotaoOuro>
        {erro && <p className="text-center text-sm text-[#ff8a80]">{erro}</p>}
        {!previa && !carregando && <p className="pt-1 text-center text-[13px] text-white/45">Grátis · resultado na hora · sem cadastro</p>}
      </form>

      {!previa && !carregando && (
        <div className="mt-10 space-y-3">
          {[
            ["Marcas iguais e parecidas", "Nomes idênticos, com grafia diferente ou que soam igual ao seu."],
            ["Concorrentes do seu ramo", "A análise olha as classes onde o seu negócio precisa estar protegido."],
            ["Risco e próximo passo", "Um medidor de risco e as recomendações para registrar com segurança."],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-3 rounded-2xl bg-white/[0.05] px-4 py-3.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: OURO }} aria-hidden />
              <span>
                <span className="block text-[16px] font-black">{t}</span>
                <span className="block text-[14px] leading-snug text-white/65">{d}</span>
              </span>
            </div>
          ))}
          <p className="px-1 pt-3 text-[14px] leading-relaxed text-white/55">
            <strong className="text-white/80">Por que olhar antes?</strong> A marca é de quem pede o registro primeiro. Se já existe uma parecida no seu ramo, o pedido pode ser negado e você pode ser obrigado a trocar de nome
            depois de investir em fachada, site e redes sociais.
          </p>
        </div>
      )}

      {carregando && (
        <div className="mt-8 rounded-3xl bg-white/[0.05] p-6 text-center">
          <div className="mx-auto h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${((passo + 1) / PASSOS.length) * 100}%`, background: OURO }} />
          </div>
          <p className="mt-4 text-[15px] text-white/80">{PASSOS[passo]}</p>
        </div>
      )}

      {previa && r && (
        <div ref={resultadoRef} className="mt-10 scroll-mt-4">
          <article className="rounded-[28px] bg-white px-5 pt-6 pb-7 text-[#0b1626] shadow-2xl sm:px-7">
            {/* cabeçalho do relatório */}
            <header className="flex items-center gap-3 border-b-2 pb-4" style={{ borderColor: OURO }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo_mc.jpg" alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="font-[family-name:var(--font-playfair)] text-[1.2rem] leading-tight font-extrabold">Relatório de Viabilidade de Marca</p>
                <p className="text-[12px] text-[#0b1626]/55">Prévia automática · {geradoEm}</p>
              </div>
            </header>

            <dl className="mt-4 space-y-1.5 rounded-2xl bg-[#f3f1ec] px-4 py-3.5 text-[14px]">
              <div className="flex gap-2">
                <dt className="shrink-0 font-black">Marca pesquisada:</dt>
                <dd className="min-w-0 break-words">{previa.marca}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-black">Ramo:</dt>
                <dd className="min-w-0 break-words">{previa.ramo}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-black">Classes analisadas:</dt>
                <dd className="min-w-0">{previa.classes.map((c) => `${cls(c)} (${nomeClasse(c)})`).join(", ")}</dd>
              </div>
            </dl>

            <Secao n={1} titulo="Resultado">
              <Medidor nivel={previa.risco} />
              <p className="-mt-1 text-center text-sm font-black tracking-[0.18em] uppercase" style={{ color: COR_NIVEL[previa.risco] }}>
                {r.rotulo}
              </p>
              <p className="mt-2 text-center font-[family-name:var(--font-playfair)] text-[1.6rem] leading-tight font-extrabold text-[#0b1626]">{r.titulo}</p>
              <p className="mt-2 text-center">{r.texto}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  [previa.total, previa.total === 1 ? "marca parecida" : "marcas parecidas"],
                  [previa.identicas, previa.identicas === 1 ? "quase idêntica" : "quase idênticas"],
                  [previa.registradas, previa.registradas === 1 ? "já registrada" : "já registradas"],
                ].map(([n, t]) => (
                  <div key={String(t)} className="rounded-2xl bg-[#f3f1ec] px-2 py-3">
                    <p className="text-[1.6rem] leading-none font-black text-[#0b1626]">{n}</p>
                    <p className="mt-1 text-[12px] leading-tight text-[#0b1626]/60">{t}</p>
                  </div>
                ))}
              </div>
            </Secao>

            <Secao n={2} titulo="Principais anterioridades">
              {previa.parecidas.length === 0 ? (
                <p>Nenhuma marca ativa com nome igual ou parecido foi encontrada nas classes analisadas.</p>
              ) : (
                <>
                  <p className="mb-3">Marcas ativas que podem ser comparadas com a sua, da mais parecida para a menos:</p>
                  <ul className="space-y-2">
                    {previa.parecidas.map((p) => {
                      const g = grau(p.parecenca);
                      return (
                        <li key={p.processo} className="rounded-2xl border border-[#0b1626]/10 px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 text-[17px] leading-tight font-black break-words text-[#0b1626]">{p.marca}</p>
                            <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold text-white" style={{ background: g.c }}>
                              {g.t}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[13px] leading-snug text-[#0b1626]/60">
                            Processo {p.processo} · {cls(p.classe)} · {situacaoTxt(p.situacao)}
                            {p.deposito ? ` · desde ${dataBr(p.deposito)}` : ""}
                          </p>
                          {p.titular && <p className="mt-0.5 truncate text-[13px] text-[#0b1626]/60">Titular: {p.titular}</p>}
                        </li>
                      );
                    })}
                  </ul>
                  {previa.total > previa.parecidas.length && (
                    <p className="mt-3 text-[14px] text-[#0b1626]/60">
                      E mais {previa.total - previa.parecidas.length} {previa.total - previa.parecidas.length === 1 ? "marca parecida" : "marcas parecidas"} com menor grau de semelhança.
                    </p>
                  )}
                </>
              )}
            </Secao>

            <Secao n={3} titulo="Análise por classe">
              <ul className="space-y-2">
                {previa.porClasse.map((c) => {
                  const k = conflito(c.total, c.maior);
                  return (
                    <li key={c.classe} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f3f1ec] px-4 py-3">
                      <span className="min-w-0">
                        <span className="block font-black text-[#0b1626]">{cls(c.classe)}</span>
                        <span className="block text-[13px] text-[#0b1626]/60">
                          {nomeClasse(c.classe)} · {c.total === 0 ? "nenhuma parecida" : c.total === 1 ? "1 parecida" : `${c.total} parecidas`}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-black" style={{ color: k.c }}>
                        {k.t}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Secao>

            <Secao n={4} titulo="Conclusão e recomendações">
              <p>
                <strong className="text-[#0b1626]">Chance de o pedido ser negado:</strong> {r.indeferimento}
              </p>
              <ul className="mt-3 space-y-2">
                {r.recomendacoes.map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: OURO }} aria-hidden />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </Secao>

            <div className="mt-7 rounded-2xl border-2 border-dashed border-[#0b1626]/15 px-4 py-4">
              <p className="text-[15px] font-black text-[#0b1626]">No relatório completo, o especialista ainda analisa:</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[#0b1626]/65">
                o logo e os elementos visuais, outras classes que fazem sentido para o seu negócio, se as marcas parecidas estão realmente em uso e a melhor estratégia para o pedido.
              </p>
            </div>

            <p className="mt-5 text-[11.5px] leading-snug text-[#0b1626]/45">
              Prévia automática, de caráter informativo. Pedidos feitos nos últimos 60 dias podem ainda não aparecer. A análise final é feita por um especialista.
            </p>
          </article>

          <div className="mt-8 text-center">
            <p className="font-[family-name:var(--font-playfair)] text-[1.7rem] leading-tight font-extrabold">
              {previa.risco === "baixo" ? "Garanta o nome antes de alguém." : "Quer saber como registrar mesmo assim?"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-snug text-white/70">Fale agora com um especialista em marcas do escritório. A conversa é sem custo.</p>
          </div>
          <BotaoZap mensagem={mensagemZap} onClick={cliqueZap} texto="Falar com um especialista" />
        </div>
      )}

      {erro && /várias consultas/.test(erro) && <BotaoZap mensagem={mensagemZap} onClick={cliqueZap} texto="Falar com um especialista" />}
    </Moldura>
  );
}

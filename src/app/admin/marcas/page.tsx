import Link from "next/link";
import { formatarProcesso } from "@/lib/marcas/formato";
import { Bell, CalendarDays, ChevronRight, CircleCheck, Database, Info, PlusCircle, Shield } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { despachosDaRevista, listColidencias, listMarcas, listPrazos, listRevistas, nomeDaMarca } from "@/lib/marcas/dados";
import { etapasDaPrevisao } from "@/lib/marcas/previsao";
import { ESTAGIOS, estagioDaSituacao } from "@/lib/marcas/situacao";
import { PrazosMovimentacoes } from "./prazos-movimentacoes";
import { DespachosRevista } from "./despachos-revista";
import { MostrarEncerrados } from "./mostrar-encerrados";

// Marcas → Principal: a mesma "Visão geral" do Marca Acompanhada (mesma ordem
// de blocos das telas dele), com os números da carteira acompanhada no INPI.

const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** Ordem das próximas movimentações: "a qualquer momento" primeiro, depois por data. */
function chave(quando: string): number {
  if (/qualquer/.test(quando)) return 0;
  const d = quando.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (d) return Number(`${d[3]}${d[2]}${d[1]}`);
  const m = quando.match(/([a-zç]{3})\/(\d{4})/i);
  if (m) return Number(`${m[2]}${String(MESES.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}15`);
  return 99999999;
}

export default async function MarcasPrincipalPage() {
  await exigirPermissao("marcas");
  const hoje = hojeBahia();
  const [marcas, patentes, prazos, revistas, colidencias] = await Promise.all([
    listMarcas(),
    listMarcas({ tipo: "patente" }),
    listPrazos(),
    listRevistas(),
    listColidencias(),
  ]);
  const ultima = revistas.find((r) => r.processada_em) ?? null;
  // sem revista lida pelo robô ainda: a última RPI que aparece na carteira
  const ultimaRpi = ultima?.numero ?? Math.max(0, ...marcas.map((m) => m.ultima_rpi ?? 0));
  const ultimaData = ultima?.data ?? marcas.find((m) => m.ultima_rpi === ultimaRpi)?.ultimo_despacho_data ?? null;
  const despachos = ultimaRpi ? await despachosDaRevista(ultimaRpi) : [];
  // a revista sai toda terça: a próxima é a terça seguinte à última
  const proxima = ultimaData ? somaDias(ultimaData, 7) : null;
  const abertos = prazos.filter((p) => p.situacao === "pendente");
  const oposicoes = colidencias.filter((c) => c.status === "pendente");

  const contar = (lista: typeof marcas) => {
    const n = new Map<string, number>();
    let sem = 0;
    for (const m of lista) {
      const e = estagioDaSituacao(m.situacao);
      if (!e) sem++;
      else n.set(e, (n.get(e) ?? 0) + 1);
    }
    return { n, sem };
  };
  const porEstagio = contar(marcas);
  const porEstagioPat = contar(patentes);
  const encerradas = ESTAGIOS.filter((e) => e.encerrado).reduce((s, e) => s + (porEstagio.n.get(e.id) ?? 0), 0);
  const encerradasPat = ESTAGIOS.filter((e) => e.encerrado).reduce((s, e) => s + (porEstagioPat.n.get(e.id) ?? 0), 0);

  // próximas movimentações previstas: a primeira etapa da previsão de cada processo
  const previstas = [...marcas, ...patentes]
    .flatMap((m) => {
      const e = etapasDaPrevisao(m.previsao)[0];
      return e ? [{ processo: m.processo, tipo: m.tipo, nome: nomeDaMarca(m), ...e }] : [];
    })
    .sort((a, b) => chave(a.quando) - chave(b.quando));

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted" aria-label="Caminho">
        Espaço de trabalho <ChevronRight className="h-3.5 w-3.5" aria-hidden /> Principal
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Visão geral</h1>
          <p className="mt-1 text-sm text-muted">Acompanhe sua carteira e as próximas ações no INPI.</p>
        </div>
        <Link href="/admin/marcas/cadastrar" className="ui-btn">
          <PlusCircle className="h-4 w-4" aria-hidden /> Cadastrar processo
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="ui-card flex flex-col p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-foreground">Para sua atenção</h2>
            <CircleCheck className="h-5 w-5 text-muted" aria-hidden />
          </div>
          <a href="#prazos" className="mt-4 flex items-center gap-4 border-b border-border pb-5 hover:opacity-80">
            <span className="text-5xl font-medium tracking-tight text-foreground tabular-nums">{abertos.length}</span>
            <span className="text-sm leading-snug text-foreground/75">
              prazos administrativos
              <br />
              em aberto
            </span>
          </a>
          <Link href="/admin/marcas/colidencias" className="flex items-center justify-between border-b border-border py-3.5 text-sm text-foreground/80 hover:text-foreground">
            Potenciais oposições <span className="font-semibold text-foreground tabular-nums">{oposicoes.length}</span>
          </Link>
          <Link href="/admin/marcas/whatsapp" className="flex items-center justify-between py-3.5 text-sm text-foreground/80 hover:text-foreground">
            Clientes para avisar no WhatsApp <span className="font-semibold text-foreground tabular-nums">{marcas.filter((m) => m.contato_numero).length}</span>
          </Link>
          <Link href="/admin/marcas/whatsapp" className="mt-auto flex items-center justify-center gap-1.5 border-t border-border pt-4 text-sm text-navy-3 hover:underline">
            <Bell className="h-4 w-4" aria-hidden /> Configurar notificações <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        <section className="ui-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-foreground">Novidades e melhorias</h2>
            <Info className="h-5 w-5 text-muted" aria-hidden />
          </div>
          <p className="mt-3 text-[13px] text-muted">
            <span className="contador-ma mr-3 rounded px-2 py-1 text-[13px] font-medium">Versão 2026.10.30</span>
            Portal MC Advogados
          </p>
          <div className="mt-4 divide-y divide-border">
            {[
              ["Revista lida no dia", "A RPI é lida na terça em que sai e a situação de cada marca é conferida direto no INPI, sem esperar a semana seguinte."],
              ["Aviso no WhatsApp", "Cada status tem a sua mensagem pronta. Envie na hora pelo botão ou deixe automático no dia do mês que escolher."],
              ["Ficha para o cliente", "Na ficha da marca, o botão Imprimir (ou Ctrl+P) gera o PDF com logo, situação, previsão e publicações."],
            ].map(([t, d]) => (
              <div key={t} className="py-3">
                <p className="text-sm font-semibold text-foreground">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/70">{d}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="faixa-ma grid grid-cols-1 gap-4 rounded-[10px] px-5 py-4 sm:grid-cols-[auto_auto_auto] sm:justify-start sm:gap-10">
        <div className="flex items-start gap-2.5">
          <Shield className="mt-0.5 h-4 w-4" aria-hidden />
          <div>
            <p className="text-[11px] font-medium tracking-wider uppercase opacity-80">Acompanhamento ativo</p>
            <p className="text-[15px] font-semibold">{marcas.length + patentes.length} processo(s) monitorado(s)</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Database className="mt-0.5 h-4 w-4" aria-hidden />
          <div>
            <p className="text-[11px] font-medium tracking-wider uppercase opacity-80">Última RPI processada</p>
            <p className="text-[15px] font-semibold">{ultimaRpi ? `${ultimaRpi} - ${dataBR(ultimaData)}` : "—"}</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <CalendarDays className="mt-0.5 h-4 w-4" aria-hidden />
          <div>
            <p className="text-[11px] font-medium tracking-wider uppercase opacity-80">Próxima RPI</p>
            <p className="text-[15px] font-semibold">{proxima ? `~${dataBR(proxima).slice(0, 5)}` : "—"}</p>
          </div>
        </div>
      </section>

      <h2 id="prazos" className="scroll-mt-20 text-xl font-semibold text-foreground">
        Movimentações
      </h2>
      <PrazosMovimentacoes
        hoje={hoje}
        prazos={prazos.map((p) => ({
          id: p.id,
          nome: nomeDaMarca(p.marcas),
          tipo: p.marcas.tipo,
          processo: p.marcas.processo,
          acao: p.acao,
          situacao: p.situacao,
          vence: p.vence_em,
          cliente: p.marcas.clients?.name ?? null,
        }))}
        colidencias={oposicoes.map((c) => ({
          id: c.id,
          nome: nomeDaMarca(c.marcas),
          tipo: "marca",
          processo: c.marcas.processo,
          acao: `Potencial oposição: ${c.nome ?? c.processo} (RPI ${c.rpi})`,
        }))}
      />

      <section className="ui-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">Última revista processada</h3>
          {ultimaRpi > 0 && <span className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground">RPI {ultimaRpi}</span>}
          <span className="text-sm text-muted">{ultimaData ? `publicada em ${dataBR(ultimaData)}` : "nenhuma revista lida ainda"}</span>
        </div>
        <div className="flex items-center justify-between border-b border-border px-5 py-5">
          <h4 className="text-[15px] font-semibold text-foreground">Despachos para os processos acompanhados</h4>
          <span className="text-sm text-foreground/70">{despachos.length} nesta revista</span>
        </div>
        <DespachosRevista
          linhas={despachos.map((d) => ({ id: d.id, tipo: d.marcas.tipo, processo: d.marcas.processo, titulo: nomeDaMarca(d.marcas), despacho: d.despacho }))}
        />
      </section>

      <h2 className="text-xl font-semibold text-foreground">Visão geral</h2>
      <section className="ui-card overflow-hidden">
        <h3 className="border-b border-border px-5 py-5 text-[15px] font-semibold text-foreground">Próximas movimentações previstas</h3>
        <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">
          {previstas.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">Sem previsões calculadas ainda.</li>}
          {previstas.map((p) => (
            <li key={p.processo} className="grid grid-cols-1 items-center gap-x-6 gap-y-1 px-5 py-3.5 sm:grid-cols-[1fr_1fr_160px]">
              <div className="min-w-0">
                <Link href={`/admin/marcas/processos/${p.processo}`} className="text-sm font-semibold text-foreground hover:underline">
                  {p.nome}
                </Link>
                <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                  <span className="selo-ma rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">{p.tipo}</span>
                  {formatarProcesso(p.processo)}
                </p>
              </div>
              <p className="text-sm text-foreground/75">{p.etapa}</p>
              <span className="text-right">
                <span className="block text-sm font-semibold text-foreground">{p.quando}</span>
                {p.detalhe && <span className="block text-xs text-muted">{p.detalhe}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-5 py-3 text-xs text-muted">Estimativas baseadas no ritmo atual de processamento do INPI. Os prazos reais podem variar.</p>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <section className="ui-card p-6">
          <MostrarEncerrados
            titulo={`Marcas por estágio · ${marcas.length} no total`}
            estagios={ESTAGIOS.map((e) => ({ id: e.id, rotulo: e.rotulo, cor: e.cor, encerrado: e.encerrado, n: porEstagio.n.get(e.id) ?? 0 }))}
            encerrados={encerradas}
            semSituacao={porEstagio.sem}
          />
        </section>
        <section className="ui-card p-6">
          {patentes.length ? (
            <MostrarEncerrados
              titulo={`Patentes por estágio · ${patentes.length} no total`}
              estagios={ESTAGIOS.map((e) => ({ id: e.id, rotulo: e.rotulo, cor: e.cor, encerrado: e.encerrado, n: porEstagioPat.n.get(e.id) ?? 0 }))}
              encerrados={encerradasPat}
              semSituacao={porEstagioPat.sem}
            />
          ) : (
            <>
              <h3 className="text-sm font-semibold text-foreground/80">Patentes por estágio · 0 no total</h3>
              <p className="mt-3 text-sm text-muted">Nenhuma patente acompanhada.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

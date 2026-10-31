import Link from "next/link";
import { BellRing, FilePlus, ShieldAlert, Timer, Radar, CalendarClock } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { despachosDaRevista, listColidencias, listMarcas, listPrazos, listRevistas, nomeDaMarca } from "@/lib/marcas/dados";
import { ESTAGIOS, estagioDaSituacao } from "@/lib/marcas/situacao";
import { PrazosMovimentacoes } from "./prazos-movimentacoes";
import { MostrarEncerrados } from "./mostrar-encerrados";

// Marcas → Principal (30/10/2026): a mesma Visão geral do Marca Acompanhada,
// com os números da carteira acompanhada no INPI.

const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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
  const despachos = ultima ? await despachosDaRevista(ultima.numero) : [];
  // a revista sai toda terça: a próxima é a terça seguinte à última lida
  const proxima = ultima ? somaDias(ultima.data, 7) : null;
  const abertos = prazos.filter((p) => p.situacao === "pendente");
  const oposicoes = colidencias.filter((c) => c.status === "pendente").length;

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

  // próximas movimentações: o que a previsão da ficha e os prazos legais apontam
  const previstas = marcas
    .filter((m) => m.previsao)
    .slice(0, 8)
    .map((m) => ({ processo: m.processo, nome: nomeDaMarca(m), texto: m.previsao! }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Marcas · INPI</p>
          <h1 className="page-title">Visão geral</h1>
          <p className="text-sm text-muted">Acompanhe sua carteira e as próximas ações no INPI.</p>
        </div>
        <Link href="/admin/marcas/cadastrar" className="ui-btn">
          <FilePlus className="h-4 w-4" aria-hidden /> Cadastrar processo
        </Link>
      </div>

      <section>
        <h2 className="section-title mb-3">Para sua atenção</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <a href="#prazos" className="ui-card flex items-center gap-3 p-4 transition-colors hover:bg-hover">
            <Timer className={`h-5 w-5 ${abertos.length ? "text-status-danger" : "text-muted"}`} aria-hidden />
            <span>
              <span className="numero-grande text-2xl">{abertos.length}</span>
              <span className="block text-xs text-muted">prazos administrativos em aberto</span>
            </span>
          </a>
          <Link href="/admin/marcas/colidencias" className="ui-card flex items-center gap-3 p-4 transition-colors hover:bg-hover">
            <ShieldAlert className={`h-5 w-5 ${oposicoes ? "text-status-pending" : "text-muted"}`} aria-hidden />
            <span>
              <span className="numero-grande text-2xl">{oposicoes}</span>
              <span className="block text-xs text-muted">Potenciais oposições</span>
            </span>
          </Link>
          <Link href="/admin/marcas/whatsapp" className="ui-card flex items-center gap-3 p-4 transition-colors hover:bg-hover">
            <BellRing className="h-5 w-5 text-navy-3" aria-hidden />
            <span>
              <span className="text-sm font-semibold text-foreground">Configurar notificações</span>
              <span className="block text-xs text-muted">Mensagens do WhatsApp por status</span>
            </span>
          </Link>
        </div>
      </section>

      <section className="ui-card grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="flex items-center gap-3 p-4">
          <Radar className="h-5 w-5 text-status-success" aria-hidden />
          <div>
            <p className="eyebrow">Acompanhamento ativo</p>
            <p className="text-sm font-semibold text-foreground">{marcas.length + patentes.length} processo(s) monitorado(s)</p>
          </div>
        </div>
        <div className="p-4">
          <p className="eyebrow">Última RPI processada</p>
          <p className="text-sm font-semibold text-foreground">{ultima ? `${ultima.numero} · ${dataBR(ultima.data)}` : "Nenhuma ainda"}</p>
        </div>
        <div className="flex items-center gap-3 p-4">
          <CalendarClock className="h-5 w-5 text-muted" aria-hidden />
          <div>
            <p className="eyebrow">Próxima RPI</p>
            <p className="text-sm font-semibold text-foreground">{proxima ? `~${dataBR(proxima).slice(0, 5)}` : "—"}</p>
          </div>
        </div>
      </section>

      <div id="prazos" className="scroll-mt-20">
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
          movimentacoes={despachos.map((d) => ({
            id: d.id,
            nome: nomeDaMarca(d.marcas),
            tipo: d.marcas.tipo,
            processo: d.marcas.processo,
            despacho: d.despacho,
            data: d.data,
          }))}
        />
      </div>

      <section className="ui-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="section-title">Última revista processada</h2>
          <p className="text-xs text-muted">{ultima ? `RPI ${ultima.numero} publicada em ${dataBR(ultima.data)}` : "O portal ainda não leu nenhuma revista."}</p>
        </div>
        <p className="px-4 pt-3 text-sm font-medium text-foreground">
          Despachos para os processos acompanhados <span className="text-muted">· {despachos.length} nesta revista</span>
        </p>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Processo</th>
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Despacho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {despachos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                    Nenhum despacho para a carteira nesta revista.
                  </td>
                </tr>
              )}
              {despachos.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2.5 text-sm capitalize">{d.marcas.tipo}</td>
                  <td className="px-4 py-2.5 font-mono text-sm">
                    <Link href={`/admin/marcas/processos/${d.marcas.processo}`} className="text-status-info hover:underline">
                      {d.marcas.processo}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-sm">{nomeDaMarca(d.marcas)}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground/80">{d.despacho}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="ui-card p-4">
          <h2 className="section-title">Próximas movimentações previstas</h2>
          {previstas.length ? (
            <ul className="mt-3 divide-y divide-border">
              {previstas.map((p) => (
                <li key={p.processo} className="py-2.5">
                  <Link href={`/admin/marcas/processos/${p.processo}`} className="text-sm font-medium text-foreground hover:underline">
                    {p.nome}
                  </Link>{" "}
                  <span className="font-mono text-xs text-muted">Marca {p.processo}</span>
                  <p className="text-xs text-foreground/75">{p.texto}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Sem previsões calculadas ainda.</p>
          )}
          <p className="mt-3 text-[11px] text-muted">Estimativas baseadas no ritmo atual de processamento do INPI. Os prazos reais podem variar.</p>
        </section>

        <section className="ui-card p-4">
          <MostrarEncerrados
            titulo={`Marcas por estágio · ${marcas.length} no total`}
            estagios={ESTAGIOS.map((e) => ({ id: e.id, rotulo: e.rotulo, cor: e.cor, encerrado: e.encerrado, n: porEstagio.n.get(e.id) ?? 0 }))}
            encerrados={encerradas}
            semSituacao={porEstagio.sem}
          />
          {patentes.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <MostrarEncerrados
                titulo={`Patentes por estágio · ${patentes.length} no total`}
                estagios={ESTAGIOS.map((e) => ({ id: e.id, rotulo: e.rotulo, cor: e.cor, encerrado: e.encerrado, n: porEstagioPat.n.get(e.id) ?? 0 }))}
                encerrados={encerradasPat}
                semSituacao={porEstagioPat.sem}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

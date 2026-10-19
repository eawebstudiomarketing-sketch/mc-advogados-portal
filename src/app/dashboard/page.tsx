import Link from "next/link";
import { ArrowRight, Download, FileBarChart2, FolderUp, Plus } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";
import { listProcesses } from "@/lib/data/processes";
import { listDocuments } from "@/lib/data/documents";
import { pedidosDoCliente } from "@/lib/pedidos-documentos";
import { MESES } from "@/lib/relatorio-datas";
import { atividadesDoPortal } from "@/lib/data/portal-cliente";
import { LinhaAtividade } from "@/components/cliente/linha-atividade";
import { CartaoPedido } from "@/components/cliente/cartao-pedido";

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios.replace("#", String(n)));

function saudacao() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Bahia" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// Início do portal do cliente: o que o escritório está fazendo agora e os
// pedidos que ele mesmo abriu. Sem horas e sem financeiro (decisão de 08/10).
export default async function DashboardPage() {
  const profile = await requireRole(["client"]);
  const clientId = profile.client_id!;
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const [ano, mes] = hoje.split("-").map(Number);
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  const [atividades, cliente, processos, documentos, docsPedidos] = await Promise.all([
    atividadesDoPortal(profile),
    getClient(clientId),
    listProcesses({ clientId }),
    listDocuments({ clientId }),
    pedidosDoCliente(clientId),
  ]);

  const emAndamento = atividades.filter((a) => a.status === "em_andamento");
  const naFila = atividades.filter((a) => a.status === "aberta");
  const abertas = [...emAndamento, ...naFila];
  const concluidasMes = atividades
    .filter((a) => a.status === "concluida" && (a.concluida_em ?? a.updated_at).slice(0, 10) >= inicioMes)
    .sort((x, y) => (y.concluida_em ?? y.updated_at).localeCompare(x.concluida_em ?? x.updated_at));
  const meusPedidos = atividades
    .filter((a) => a.doCliente && (a.etapa !== "concluido" || (a.concluida_em ?? a.updated_at).slice(0, 10) >= inicioMes))
    .sort((x, y) => y.created_at.localeCompare(x.created_at));
  const docsFaltando = docsPedidos.filter((p) => !p.enviado);
  const primeiroNome = profile.full_name.split(" ")[0];

  const resumo: React.ReactNode[] = [];
  if (abertas.length) {
    resumo.push(
      <>
        Estamos cuidando de <strong className="font-semibold text-foreground">{plural(abertas.length, "1 atividade", "# atividades")}</strong> para você
        {emAndamento.length ? <> ({plural(emAndamento.length, "1 em andamento", "# em andamento")})</> : null}.
      </>
    );
  } else {
    resumo.push(<>Nada em aberto agora. Precisa de algo? É só fazer um pedido.</>);
  }
  if (concluidasMes.length) resumo.push(<>Em {MESES[mes].toLowerCase()}, já {plural(concluidasMes.length, "concluímos 1", "concluímos #")}.</>);
  if (docsFaltando.length) resumo.push(<><strong className="font-semibold text-gold-ink">{plural(docsFaltando.length, "1 documento", "# documentos")}</strong> aguardando você.</>);

  return (
    <div>
      {/* abertura */}
      <section className="mb-10 grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden /> {MESES[mes]} de {ano} · {cliente?.name ?? "MC Advogados"}
          </p>
          <h1 className="page-title mt-3 !text-[2.4rem] !leading-[1.02] sm:!text-[3.1rem]">
            {saudacao()},
            <br />
            <span className="text-foreground/30">{primeiroNome}.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-foreground/70">
            {resumo.map((parte, i) => (
              <span key={i}>
                {i > 0 ? " " : ""}
                {parte}
              </span>
            ))}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href="/dashboard/pedidos/novo" className="ui-btn">
              <Plus className="h-4 w-4" aria-hidden /> Fazer um pedido
            </Link>
            {meusPedidos.length > 0 && (
              <Link href="/dashboard/pedidos" className="ui-btn-secondary">
                Acompanhar meus pedidos
              </Link>
            )}
          </div>
        </div>

        <Link
          href="/dashboard/activities"
          className="group relative overflow-hidden rounded-2xl bg-navy p-6 text-white transition-transform duration-200 hover:-translate-y-0.5"
        >
          <span className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full border border-white/10" aria-hidden />
          <span className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full border border-white/10" aria-hidden />
          <p className="eyebrow flex items-center gap-2 !text-white/55">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden /> Em aberto
          </p>
          <p className="numero-grande mt-3 text-[5rem] leading-none text-white">{abertas.length}</p>
          <p className="font-display mt-2 text-lg leading-tight font-bold">{abertas.length === 1 ? "atividade em aberto." : "atividades em aberto."}</p>
          <p className="mt-2 text-xs leading-relaxed text-white/60">
            {emAndamento.length} em andamento · {naFila.length} na fila · {concluidasMes.length} concluída{concluidasMes.length === 1 ? "" : "s"} no mês.
          </p>
          <p className="eyebrow mt-5 flex items-center justify-between !text-gold-2">
            <span>Ver todas</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </p>
        </Link>
      </section>

      {docsFaltando.length > 0 && (
        <Link
          href="/dashboard/documentos"
          className="mb-10 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3.5 transition-colors hover:border-gold"
        >
          <FolderUp className="h-5 w-5 shrink-0 text-gold-ink" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-gold-ink">
            <span className="font-semibold">Aguardando você:</span> {docsFaltando.slice(0, 3).map((p) => p.item).join(", ")}
            {docsFaltando.length > 3 ? "…" : ""}
          </p>
          <span className="eyebrow shrink-0 !text-gold-ink">Enviar ›</span>
        </Link>
      )}

      {/* o que estamos fazendo */}
      <section className="mb-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Em aberto</p>
            <h2 className="page-title mt-1 !text-2xl">O que estamos fazendo.</h2>
          </div>
          {abertas.length > 8 && (
            <Link href="/dashboard/activities" className="eyebrow shrink-0 hover:!text-foreground">
              Ver todas ›
            </Link>
          )}
        </div>
        {abertas.length === 0 ? (
          <p className="mt-4 border-y border-border py-6 text-sm text-muted">Nenhuma atividade em aberto no momento.</p>
        ) : (
          <ol className="mt-4 border-b border-border">
            {abertas.slice(0, 8).map((a, i) => (
              <LinhaAtividade key={a.id} a={a} n={i + 1} />
            ))}
          </ol>
        )}
      </section>

      {/* faixa de números */}
      <section className="mb-10 grid grid-cols-2 border-y border-border md:grid-cols-4">
        {[
          { n: emAndamento.length, rotulo: "Em andamento", href: "/dashboard/activities" },
          { n: naFila.length, rotulo: "Na fila", href: "/dashboard/activities" },
          { n: concluidasMes.length, rotulo: "Concluídas no mês", href: "/dashboard/relatorios" },
          { n: processos.length, rotulo: "Processos", href: "/dashboard/processos" },
        ].map((c, i) => (
          <Link
            key={c.rotulo}
            href={c.href}
            className={`px-1 py-5 transition-colors hover:bg-[#f7f7f4] md:px-6 ${i > 0 ? "md:border-l md:border-border" : ""} ${i % 2 ? "border-l border-border pl-4 md:border-l" : ""} ${i > 1 ? "border-t border-border md:border-t-0" : ""}`}
          >
            <p className="numero-grande text-4xl text-foreground">{c.n}</p>
            <p className="eyebrow mt-1">{c.rotulo}</p>
          </Link>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_1fr]">
        {/* pedidos dele */}
        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Seus pedidos</p>
              <h2 className="section-title !text-lg">Acompanhe cada etapa.</h2>
            </div>
            <Link href="/dashboard/pedidos/novo" className="icon-btn" aria-label="Fazer um pedido" data-tip="Fazer um pedido">
              <Plus aria-hidden />
            </Link>
          </div>
          {meusPedidos.length === 0 ? (
            <Link
              href="/dashboard/pedidos/novo"
              className="mt-4 flex flex-col items-start gap-1 rounded-2xl border border-dashed border-border-strong p-5 transition-colors hover:border-navy hover:bg-surface"
            >
              <span className="font-display text-base font-bold text-foreground">Precisa de algo do escritório?</span>
              <span className="text-sm text-muted">Faça o pedido por aqui e acompanhe até a conclusão.</span>
              <span className="eyebrow mt-2 !text-navy">Fazer um pedido ›</span>
            </Link>
          ) : (
            <>
              <ul className="mt-4 space-y-3">
                {meusPedidos.slice(0, 3).map((p) => (
                  <CartaoPedido key={p.id} p={p} />
                ))}
              </ul>
              {meusPedidos.length > 3 && (
                <Link href="/dashboard/pedidos" className="eyebrow mt-3 inline-block hover:!text-foreground">
                  + {meusPedidos.length - 3} pedido{meusPedidos.length - 3 > 1 ? "s" : ""} ›
                </Link>
              )}
            </>
          )}
        </section>

        {/* concluídas e documentos */}
        <div className="space-y-8">
          <section>
            <p className="eyebrow">Concluídas</p>
            <h2 className="section-title !text-lg">Feito em {MESES[mes].toLowerCase()}.</h2>
            {concluidasMes.length === 0 ? (
              <p className="mt-4 border-y border-border py-5 text-sm text-muted">Nenhuma atividade concluída ainda este mês.</p>
            ) : (
              <ol className="mt-4 border-b border-border">
                {concluidasMes.slice(0, 5).map((a, i) => (
                  <LinhaAtividade key={a.id} a={a} n={i + 1} />
                ))}
              </ol>
            )}
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Documentos</p>
                <h2 className="section-title !text-lg">Recentes.</h2>
              </div>
              <Link href="/dashboard/documentos" className="eyebrow hover:!text-foreground">
                Todos ›
              </Link>
            </div>
            {documentos.length === 0 ? (
              <p className="mt-4 border-y border-border py-5 text-sm text-muted">Nenhum documento ainda.</p>
            ) : (
              <ul className="mt-4 border-b border-border">
                {documentos.slice(0, 4).map((d) => (
                  <li key={d.id} className="lista-linha !py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{d.title}</span>
                      <span className="eyebrow">{new Date(d.created_at).toLocaleDateString("pt-BR")}</span>
                    </span>
                    {d.downloadUrl && (
                      <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Baixar" data-tip="Baixar">
                        <Download aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Link
        href="/dashboard/relatorios"
        className="group mt-10 flex items-center gap-4 rounded-2xl bg-navy-2 p-5 text-white transition-transform duration-200 hover:-translate-y-0.5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <FileBarChart2 className="h-5 w-5 text-gold-2" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Relatório da semana e do mês</p>
          <p className="text-sm text-white/60">Tudo o que foi feito, em andamento e na fila. Dá para baixar em PDF.</p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-gold-2 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

import Link from "next/link";
import { Cake } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { listClients } from "@/lib/data/clients";
import { EmptyState } from "@/components/ui/empty-state";
import { EditarNaLinha } from "@/components/ui/editar-na-linha";
import { getConfigAniversario, parabensJaEnviados, preencherParabens } from "@/lib/zap/aniversarios";
import { salvarNascimentoAction } from "./actions";
import { BotaoParabens, ConfigParabens } from "./parabens";

// Contatos → Aniversários (item 14 da auditoria, 30/10/2026): quem faz
// aniversário hoje e nos próximos dias, com parabéns no WhatsApp, e a lista de
// quem ainda está sem data para preencher ali mesmo.

const DIA = 86_400_000;
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

/** Dias até o próximo aniversário (0 = hoje) e a idade que vai fazer. */
function proximo(nascimento: string, hoje: string) {
  const ano = Number(hoje.slice(0, 4));
  const mmdd = nascimento.slice(5, 10);
  const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const dataEm = (a: number) => `${a}-${mmdd === "02-29" && !bissexto(a) ? "02-28" : mmdd}`;
  let alvo = dataEm(ano);
  if (alvo < hoje) alvo = dataEm(ano + 1);
  const dias = Math.round((Date.parse(`${alvo}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / DIA);
  return { dias, idade: Number(alvo.slice(0, 4)) - Number(nascimento.slice(0, 4)) };
}

const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

export default async function AniversariosPage() {
  const { profile, permissoes } = await exigirPermissao("clientes");
  const hoje = hojeBahia();
  const [clientes, config] = await Promise.all([listClients(), getConfigAniversario()]);
  const vivos = clientes.filter((c) => !c.falecido && (c.tipo_pessoa === "PF" ? permissoes.clientes_pf : true));
  const comData = vivos
    .filter((c) => c.nascimento)
    .map((c) => ({ c, ...proximo(c.nascimento!, hoje) }))
    .sort((a, b) => a.dias - b.dias);
  const deHoje = comData.filter((x) => x.dias === 0);
  const enviados = await parabensJaEnviados(
    deHoje.map((x) => x.c.id),
    Number(hoje.slice(0, 4))
  );
  const proximos = comData.filter((x) => x.dias > 0 && x.dias <= 30);
  const depois = comData.filter((x) => x.dias > 30);
  const semData = vivos.filter((c) => !c.nascimento && c.tipo_pessoa === "PF");
  const podeEditar = !!permissoes.editar_cliente;

  const linha = (x: (typeof comData)[number], acao?: React.ReactNode) => (
    <li key={x.c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-2 text-center ring-1 ring-border">
        <span className="text-sm leading-none font-bold text-foreground tabular-nums">{dataBR(x.c.nascimento!).split("/")[0]}</span>
        <span className="mt-0.5 text-[10px] leading-none text-muted uppercase">
          {new Date(`2000-${x.c.nascimento!.slice(5, 7)}-15`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/admin/clients/${x.c.id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
          {x.c.name}
        </Link>
        <p className="text-xs text-muted">
          {x.dias === 0 ? `Hoje faz ${x.idade} anos` : x.dias === 1 ? `Amanhã faz ${x.idade} anos` : `Em ${x.dias} dias · faz ${x.idade} anos`}
        </p>
      </div>
      {acao}
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-2">Contatos · Relacionamento</p>
        <h1 className="page-title">Aniversários</h1>
        <p className="text-sm text-muted">
          {comData.length} {comData.length === 1 ? "cliente com data de nascimento" : "clientes com data de nascimento"}
          {semData.length ? ` · ${semData.length} sem data` : ""}
        </p>
      </div>

      <section className="ui-card overflow-hidden">
        <h2 className="section-title border-b border-border px-4 py-3">Hoje</h2>
        {deHoje.length ? (
          <ul className="divide-y divide-border">
            {deHoje.map((x) => linha(x, <BotaoParabens clientId={x.c.id} texto={preencherParabens(config.mensagem, x.c.name)} enviado={enviados.has(x.c.id)} />))}
          </ul>
        ) : (
          <EmptyState icon={Cake} title="Ninguém faz aniversário hoje" compact />
        )}
      </section>

      <section className="ui-card overflow-hidden">
        <h2 className="section-title border-b border-border px-4 py-3">Próximos 30 dias</h2>
        {proximos.length ? <ul className="divide-y divide-border">{proximos.map((x) => linha(x))}</ul> : <EmptyState icon={Cake} title="Nenhum aniversário nos próximos 30 dias" compact />}
      </section>

      {profile.role === "admin" && <ConfigParabens ativo={config.ativo} mensagem={config.mensagem} migrationAplicada={config.migrationAplicada} />}

      {semData.length > 0 && (
        <section className="ui-card overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="section-title">Sem data de nascimento</h2>
            <p className="text-xs text-muted">{podeEditar ? "Clique em “Preencher” para pôr a data aqui mesmo." : "Peça a quem pode editar clientes para completar as datas."}</p>
          </div>
          <ul className="divide-y divide-border">
            {semData.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link href={`/admin/clients/${c.id}`} className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                  {c.name}
                </Link>
                {podeEditar && (
                  <EditarNaLinha id={c.id} tipo="data" valor={null} rotulo="Data de nascimento" salvar={salvarNascimentoAction}>
                    <span className="text-xs font-medium text-navy-3">Preencher</span>
                  </EditarNaLinha>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {depois.length > 0 && (
        <section className="ui-card overflow-hidden">
          <h2 className="section-title border-b border-border px-4 py-3">Mais adiante</h2>
          <ul className="divide-y divide-border">{depois.map((x) => linha(x))}</ul>
        </section>
      )}
    </div>
  );
}

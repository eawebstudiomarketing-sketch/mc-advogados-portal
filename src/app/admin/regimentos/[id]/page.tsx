import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/dal";
import { getRegimento } from "@/lib/regimentos/dados";
import { respondidas, totalPerguntas } from "@/lib/regimentos/tipos";
import { respostaEmTexto } from "@/components/regimentos/campo-pergunta";
import { BackButton } from "@/components/nav/back-button";
import { EditorPerguntas } from "./editor-perguntas";
import { BotoesRegimento, BotoesRespostas } from "./botoes-regimento";

// Um regimento, como o Google Forms: abas Perguntas (editor) e Respostas.
export const maxDuration = 120;

const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(iso));

export default async function RegimentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await exigirPermissao("onboarding");
  const [{ id }, { aba }] = await Promise.all([params, searchParams]);
  const r = await getRegimento(id);
  if (!r) notFound();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br";
  const link = `${site}/regimento/${r.token}`;
  const respostas = r.respostas ?? r.rascunho_respostas;
  const total = totalPerguntas(r.secoes);
  const feitas = respondidas(r.secoes, respostas);
  const naAba = aba === "respostas" ? "respostas" : "perguntas";
  const href = (a: string) => `/admin/regimentos/${r.id}${a === "perguntas" ? "" : `?aba=${a}`}`;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <BackButton fallback={r.client_id ? `/admin/clients/${r.client_id}?aba=regimento` : "/admin/regimentos"} />
      </div>
      <div className="print:hidden">
        <p className="eyebrow mb-2">
          Regimento Interno
          {r.clients?.name && (
            <>
              {" · "}
              <Link href={`/admin/clients/${r.client_id}?aba=regimento`} className="hover:underline">
                {r.clients.name}
              </Link>
            </>
          )}
        </p>
        <h1 className="page-title">{r.titulo}</h1>
        <p className="text-sm text-muted">
          {r.segmento ? `${r.segmento} · ` : ""}
          {r.secoes.length} seções · {total} perguntas
          {r.status === "respondido" && r.respondido_em ? ` · respondido em ${quando(r.respondido_em)}${r.respondente ? ` por ${r.respondente}` : ""}` : ""}
        </p>
      </div>

      <section className="ui-card space-y-3 p-4 print:hidden">
        <BotoesRegimento id={r.id} link={link} aceitando={r.aceitando} clientId={r.client_id} />
        <p className="truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-xs text-muted">{link}</p>
      </section>

      <nav className="flex justify-center gap-8 border-b border-border print:hidden" aria-label="Perguntas e respostas">
        {[
          ["perguntas", "Perguntas"],
          ["respostas", `Respostas ${feitas ? `(${feitas})` : ""}`],
        ].map(([a, rotulo]) => (
          <Link
            key={a}
            href={href(a)}
            aria-current={naAba === a ? "page" : undefined}
            className={`-mb-px border-b-[3px] px-2 pb-2.5 text-sm font-medium ${naAba === a ? "border-navy text-navy-3" : "border-transparent text-foreground/65 hover:text-foreground"}`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      {naAba === "perguntas" ? (
        <div className="mx-auto max-w-[800px]">
          <EditorPerguntas id={r.id} titulo={r.titulo} descricao={r.descricao ?? ""} secoes={r.secoes} temRespostas={feitas > 0} />
        </div>
      ) : (
        <div className="ficha-marca mx-auto max-w-[800px] space-y-4">
          <section className="ui-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <h2 className="text-lg font-semibold text-foreground">
                  {r.status === "respondido" ? "Respostas enviadas" : feitas ? "Respostas em andamento (ainda não enviadas)" : "Nenhuma resposta ainda"}
                </h2>
                <p className="text-sm text-muted">
                  {feitas} de {total} perguntas respondidas
                  {r.status === "respondido" && r.respondido_em ? ` · enviado em ${quando(r.respondido_em)}${r.respondente ? ` por ${r.respondente}` : ""}` : ""}
                </p>
              </div>
              <BotoesRespostas id={r.id} respondido={r.status === "respondido"} />
            </div>
          </section>
          <div className="hidden print:block">
            <h1 className="text-xl font-semibold">{r.titulo}</h1>
            <p className="text-sm">Perguntas e respostas{r.respondido_em ? ` · enviado em ${quando(r.respondido_em)}` : ""}</p>
          </div>
          {r.secoes.map((s, si) => (
            <section key={s.id} className="ui-card overflow-hidden">
              <h3 className="bg-navy px-5 py-2.5 text-sm font-semibold text-white">{s.titulo}</h3>
              <ol className="divide-y divide-border">
                {s.perguntas.map((p, pi) => {
                  const v = respostaEmTexto(respostas?.[p.id]);
                  return (
                    <li key={p.id} className="px-5 py-3 break-inside-avoid">
                      <p className="text-sm font-medium text-foreground">
                        {si + 1}.{pi + 1} {p.texto}
                      </p>
                      <p className={`mt-1 text-sm whitespace-pre-line ${v ? "text-foreground/85" : "text-muted italic"}`}>{v || "Sem resposta"}</p>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

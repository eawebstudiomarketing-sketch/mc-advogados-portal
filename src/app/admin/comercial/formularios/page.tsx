import Link from "next/link";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { db, funilDosFormularios, listarFormularios } from "@/lib/crm/dados";
import { CopiarLink } from "./copiar-link";

// Formulários do CRM (06/11/2026): cada um tem um link público
// (mcadvogados.app.br/f/<endereço>) e o funil dos últimos 30 dias.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br";
const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function FormulariosPage() {
  await exigirPermissao("comercial");
  const desde = diasAtras(30);
  const [forms, funil, { data: leads }] = await Promise.all([listarFormularios(), funilDosFormularios(desde), db().from("leads").select("formulario_id").not("formulario_id", "is", null)]);
  const total = new Map<string, number>();
  for (const l of leads ?? []) total.set(l.formulario_id as string, (total.get(l.formulario_id as string) ?? 0) + 1);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Comercial · CRM</p>
          <h1 className="page-title">Formulários</h1>
          <p className="text-sm text-muted">Quiz de uma pergunta por tela, no lugar do Yay! Forms. Cada resposta vira lead no funil, avisa quem cuida e conta para os pixels.</p>
        </div>
        <Link href="/admin/comercial/formularios/novo" className="ui-btn inline-flex items-center gap-1.5 px-4 py-2 text-sm">
          <Plus className="h-4 w-4" aria-hidden /> Novo formulário
        </Link>
      </div>

      <ul className="grid gap-4 lg:grid-cols-2">
        {forms.map((f) => {
          const n = funil.get(f.id) ?? { abriu: 0, comecou: 0, enviou: 0 };
          const link = `${SITE}/f/${f.slug}`;
          return (
            <li key={f.id} className="ui-card flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                {f.config.boasVindas.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.config.boasVindas.imagem} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover object-top" />
                ) : (
                  <span className="h-16 w-16 shrink-0 rounded-lg" style={{ background: f.config.tema.fundo }} aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-foreground">{f.nome}</h2>
                  <p className="truncate text-xs text-muted">{link.replace(/^https?:\/\//, "")}</p>
                  <p className="mt-1 text-xs">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${f.ativo ? "bg-status-success-bg text-status-success" : "bg-surface-2 text-muted"}`}>{f.ativo ? "No ar" : "Desligado"}</span>
                    <span className="ml-2 text-muted">{f.config.campos.length} perguntas · {total.get(f.id) ?? 0} leads no total</span>
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-4 gap-2 rounded-xl bg-surface-2 p-3 text-center">
                {[
                  ["Abriram", String(n.abriu)],
                  ["Começaram", String(n.comecou)],
                  ["Enviaram", String(n.enviou)],
                  ["Conversão", pct(n.enviou, n.abriu)],
                ].map(([r, v]) => (
                  <div key={r}>
                    <dt className="text-[11px] text-muted">{r}</dt>
                    <dd className="text-lg font-semibold text-foreground tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="-mt-2 text-[11px] text-muted">Últimos 30 dias.</p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link href={`/admin/comercial/formularios/${f.id}`} className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                </Link>
                <CopiarLink link={link} />
                <a href={link} target="_blank" rel="noopener noreferrer" className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir
                </a>
              </div>
            </li>
          );
        })}
        {forms.length === 0 && <li className="ui-card px-5 py-12 text-center text-sm text-muted lg:col-span-2">Nenhum formulário ainda.</li>}
      </ul>
    </div>
  );
}

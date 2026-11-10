"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, ExternalLink, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { CAMPO_ROTULO, novoId, type Campo, type CampoTipo, type FormConfig, type Tela } from "@/lib/crm/tipos";
import { duplicarFormularioAction, enviarImagemAction, excluirFormularioAction, salvarFormularioAction } from "../../actions";

// Editor do formulário do CRM: dados gerais, cores, tela de boas-vindas,
// perguntas (tipo, texto, imagem, obrigatória, para onde vai a resposta,
// pulos) e tela final. Salva tudo de uma vez.

type Estado = { id: string | null; slug: string; nome: string; ativo: boolean; responsavel_padrao: string | null; config: FormConfig };

const COM_OPCOES: CampoTipo[] = ["escolha", "multipla", "sim_nao"];
const slugDe = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

function Imagem({ url, onMudar }: { url?: string | null; onMudar: (u: string | null) => void }) {
  const [enviando, iniciar] = useTransition();
  return (
    <div className="flex items-center gap-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-16 w-12 rounded-md object-cover object-top" />
      ) : (
        <span className="grid h-16 w-12 place-items-center rounded-md border border-dashed border-border text-muted">
          <ImagePlus className="h-4 w-4" aria-hidden />
        </span>
      )}
      <label className="ui-btn-secondary cursor-pointer px-3 py-1.5 text-xs">
        {enviando ? "Enviando…" : url ? "Trocar imagem" : "Pôr imagem"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const fd = new FormData();
            fd.set("arquivo", f);
            iniciar(async () => {
              const r = await enviarImagemAction(fd);
              if (r.ok) onMudar(r.url);
              else toast.error(r.erro);
            });
          }}
        />
      </label>
      {url && (
        <button type="button" onClick={() => onMudar(null)} className="text-xs text-muted hover:text-foreground">
          Tirar
        </button>
      )}
      <span className="text-[11px] text-muted">Vertical (ex.: 1080×1350), escurecendo embaixo.</span>
    </div>
  );
}

function EditorTela({ titulo, tela, onMudar, comLink }: { titulo: string; tela: Tela; onMudar: (t: Tela) => void; comLink?: boolean }) {
  return (
    <section className="ui-card space-y-3 p-5">
      <h2 className="section-title">{titulo}</h2>
      <label className="block space-y-1.5">
        <span className="ui-label">Título</span>
        <input value={tela.titulo} onChange={(e) => onMudar({ ...tela, titulo: e.target.value })} className="ui-input" />
      </label>
      <label className="block space-y-1.5">
        <span className="ui-label">Texto</span>
        <textarea value={tela.descricao ?? ""} onChange={(e) => onMudar({ ...tela, descricao: e.target.value })} rows={3} className="ui-input" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="ui-label">Texto do botão</span>
          <input value={tela.botao ?? ""} onChange={(e) => onMudar({ ...tela, botao: e.target.value })} className="ui-input" />
        </label>
        {comLink && (
          <label className="block space-y-1.5">
            <span className="ui-label">Link do botão (ex.: WhatsApp)</span>
            <input value={tela.link ?? ""} onChange={(e) => onMudar({ ...tela, link: e.target.value })} placeholder="https://wa.me/5573..." className="ui-input" />
          </label>
        )}
      </div>
      <Imagem url={tela.imagem} onMudar={(u) => onMudar({ ...tela, imagem: u })} />
    </section>
  );
}

export function EditorFormulario({ inicial, equipe, podeExcluir, site }: { inicial: Estado; equipe: { id: string; nome: string }[]; podeExcluir: boolean; site: string }) {
  const [f, setF] = useState<Estado>(inicial);
  const [salvando, iniciar] = useTransition();
  const router = useRouter();
  const cfg = f.config;
  const setCfg = (c: Partial<FormConfig>) => setF({ ...f, config: { ...cfg, ...c } });
  const setCampo = (i: number, c: Partial<Campo>) => setCfg({ campos: cfg.campos.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const moverCampo = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= cfg.campos.length) return;
    const c = [...cfg.campos];
    [c[i], c[j]] = [c[j], c[i]];
    setCfg({ campos: c });
  };

  const salvar = () =>
    iniciar(async () => {
      const r = await salvarFormularioAction({ ...f, slug: f.slug || slugDe(f.nome) });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success("Formulário salvo.");
      if (!f.id && r.id) router.replace(`/admin/comercial/formularios/${r.id}`);
      else router.refresh();
    });

  const link = `${site}/f/${f.slug || slugDe(f.nome) || "endereco"}`;

  return (
    <div className="space-y-6 pb-24">
      <section className="ui-card grid gap-3 p-5 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="ui-label">Nome (só para a equipe)</span>
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value, slug: f.id || f.slug ? f.slug : "" })} placeholder="Quiz registro de marca" className="ui-input" />
        </label>
        <label className="block space-y-1.5">
          <span className="ui-label">Endereço do link</span>
          <div className="flex items-center gap-1 text-sm text-muted">
            <span className="shrink-0">/f/</span>
            <input value={f.slug} onChange={(e) => setF({ ...f, slug: slugDe(e.target.value) })} placeholder={slugDe(f.nome) || "registro-de-marca"} className="ui-input" />
          </div>
        </label>
        <label className="block space-y-1.5">
          <span className="ui-label">Quem recebe os leads (se não houver rodízio)</span>
          <select value={f.responsavel_padrao ?? ""} onChange={(e) => setF({ ...f, responsavel_padrao: e.target.value || null })} className="ui-input">
            <option value="">Dr. Maurício (padrão)</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} className="h-4 w-4" />
          No ar (desligado, o link mostra “não encontrado”)
        </label>
        <div className="sm:col-span-2">
          <span className="ui-label mb-1.5 block">Cores</span>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["fundo", "Fundo"],
                ["pagina", "Laterais"],
                ["texto", "Texto"],
                ["resposta", "Linhas"],
                ["botaoFundo", "Botão"],
                ["botaoTexto", "Texto do botão"],
              ] as const
            ).map(([k, r]) => (
              <label key={k} className="flex items-center gap-2 text-xs text-muted">
                <input type="color" value={cfg.tema[k]} onChange={(e) => setCfg({ tema: { ...cfg.tema, [k]: e.target.value } })} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
                {r}
              </label>
            ))}
          </div>
        </div>
      </section>

      <EditorTela titulo="Tela de boas-vindas" tela={cfg.boasVindas} onMudar={(t) => setCfg({ boasVindas: t })} />

      <section className="space-y-3">
        <h2 className="section-title">Perguntas ({cfg.campos.length})</h2>
        {cfg.campos.map((c, i) => (
          <article key={c.id} className="ui-card space-y-3 p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
              <select value={c.tipo} onChange={(e) => setCampo(i, { tipo: e.target.value as CampoTipo })} className="ui-input !w-auto py-1.5 text-sm" aria-label="Tipo da pergunta">
                {Object.entries(CAMPO_ROTULO).map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="flex-1" />
              <button type="button" onClick={() => moverCampo(i, -1)} disabled={i === 0} aria-label="Subir" className="rounded p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => moverCampo(i, 1)} disabled={i === cfg.campos.length - 1} aria-label="Descer" className="rounded p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setCfg({ campos: cfg.campos.filter((_, j) => j !== i) })} aria-label="Tirar pergunta" className="rounded p-1.5 text-muted hover:bg-status-danger-bg hover:text-status-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input value={c.titulo} onChange={(e) => setCampo(i, { titulo: e.target.value })} placeholder="Pergunta" className="ui-input text-base font-medium" aria-label="Pergunta" />
            <input value={c.descricao ?? ""} onChange={(e) => setCampo(i, { descricao: e.target.value })} placeholder="Texto de apoio (opcional)" className="ui-input" aria-label="Texto de apoio" />
            {(c.tipo === "escolha" || c.tipo === "multipla") && (
              <label className="block space-y-1.5">
                <span className="ui-label">Opções (uma por linha)</span>
                <textarea value={(c.opcoes ?? []).join("\n")} onChange={(e) => setCampo(i, { opcoes: e.target.value.split("\n") })} rows={Math.max(3, (c.opcoes ?? []).length)} className="ui-input" />
              </label>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-muted">Obrigatória (todas são)</span>
              <label className="flex items-center gap-2 text-sm text-muted">
                A resposta é o
                <select value={c.mapear ?? ""} onChange={(e) => setCampo(i, { mapear: (e.target.value || null) as Campo["mapear"] })} className="ui-input !w-auto py-1 text-sm">
                  <option value="">— (só guarda)</option>
                  <option value="nome">Nome do lead</option>
                  <option value="telefone">WhatsApp do lead</option>
                  <option value="email">E-mail do lead</option>
                  <option value="empresa">Empresa / marca</option>
                </select>
              </label>
            </div>
            {COM_OPCOES.includes(c.tipo) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">Pular conforme a resposta ({(c.pulos ?? []).length})</summary>
                <div className="mt-2 space-y-2">
                  {(c.pulos ?? []).map((p, k) => (
                    <div key={k} className="flex flex-wrap items-center gap-2">
                      Se responder
                      <select value={p.se} onChange={(e) => setCampo(i, { pulos: (c.pulos ?? []).map((x, z) => (z === k ? { ...x, se: e.target.value } : x)) })} className="ui-input !w-auto py-1 text-sm">
                        {(c.tipo === "sim_nao" ? ["Sim", "Não"] : (c.opcoes ?? []).filter(Boolean)).map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                      vai para
                      <select value={p.para} onChange={(e) => setCampo(i, { pulos: (c.pulos ?? []).map((x, z) => (z === k ? { ...x, para: e.target.value } : x)) })} className="ui-input !w-auto py-1 text-sm">
                        {cfg.campos.slice(i + 1).map((x, z) => (
                          <option key={x.id} value={x.id}>
                            {i + z + 2}. {x.titulo.slice(0, 40)}
                          </option>
                        ))}
                        <option value="fim">Enviar (tela final)</option>
                      </select>
                      <button type="button" onClick={() => setCampo(i, { pulos: (c.pulos ?? []).filter((_, z) => z !== k) })} aria-label="Tirar pulo" className="rounded p-1 text-muted hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCampo(i, { pulos: [...(c.pulos ?? []), { se: c.tipo === "sim_nao" ? "Sim" : ((c.opcoes ?? [])[0] ?? ""), para: cfg.campos[i + 1]?.id ?? "fim" }] })}
                    className="text-sm font-medium text-navy-3 hover:underline"
                  >
                    + Acrescentar pulo
                  </button>
                </div>
              </details>
            )}
            <Imagem url={c.imagem} onMudar={(u) => setCampo(i, { imagem: u })} />
          </article>
        ))}
        <button
          type="button"
          onClick={() => setCfg({ campos: [...cfg.campos, { id: novoId(), tipo: "texto", titulo: "", imagem: cfg.campos.at(-1)?.imagem ?? cfg.boasVindas.imagem ?? null }] })}
          className="ui-btn-secondary inline-flex w-full items-center justify-center gap-1.5 py-3 text-sm"
        >
          <Plus className="h-4 w-4" aria-hidden /> Acrescentar pergunta
        </button>
      </section>

      <EditorTela titulo="Tela final (depois de enviar)" tela={cfg.final} onMudar={(t) => setCfg({ final: t })} comLink />

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
        <button type="button" onClick={salvar} disabled={salvando} className="ui-btn px-5 py-2 text-sm">
          {salvando ? "Salvando…" : "Salvar formulário"}
        </button>
        {f.id && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="ui-btn-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
            <ExternalLink className="h-4 w-4" aria-hidden /> Abrir o link
          </a>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{link.replace(/^https?:\/\//, "")}</span>
        {f.id && (
          <button type="button" onClick={() => iniciar(async () => void (await duplicarFormularioAction(f.id!)))} className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm">
            <Copy className="h-4 w-4" aria-hidden /> Duplicar
          </button>
        )}
        {f.id && podeExcluir && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Excluir este formulário? Os leads que vieram dele continuam no funil.")) iniciar(async () => void (await excluirFormularioAction(f.id!)));
            }}
            className="rounded-lg p-2 text-muted hover:bg-status-danger-bg hover:text-status-danger"
            aria-label="Excluir formulário"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageUp, Loader2, X } from "lucide-react";
import { buscaIAAction } from "../busca-actions";
import { lerCarrinho, type ItemCarrinho } from "../busca-integrada/painel-busca";

// Busca com IA → "Pesquisa de Viabilidade de Marca" (mesmos campos do Marca Acompanhada).

export function FormBuscaIA() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [siglas, setSiglas] = useState(false);
  const [logo, setLogo] = useState<{ mime: string; base64: string; url: string } | null>(null);
  const [textoLogo, setTextoLogo] = useState("");
  const [usarTextoLogo, setUsarTextoLogo] = useState(false);
  const [ondeUsar, setOndeUsar] = useState("");
  const [contexto, setContexto] = useState("");
  const [comCarrinho, setComCarrinho] = useState(false);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [pending, start] = useTransition();

  // o carrinho mora no navegador: lido depois de montar (no servidor não existe)
  useEffect(() => {
    const t = setTimeout(() => setCarrinho(lerCarrinho()));
    return () => clearTimeout(t);
  }, []);

  function escolherLogo(f: File | undefined) {
    if (!f) return;
    if (!/image\/(png|jpe?g)/.test(f.type)) return void toast.error("Use PNG ou JPEG.");
    if (f.size > 5 * 1024 * 1024) return void toast.error("Máximo de 5 MB.");
    const leitor = new FileReader();
    leitor.onload = () => {
      const url = String(leitor.result);
      setLogo({ mime: f.type, base64: url.split(",")[1] ?? "", url });
    };
    leitor.readAsDataURL(f);
  }

  function pesquisar() {
    start(async () => {
      const r = await buscaIAAction({
        nome,
        siglas,
        ondeUsar,
        contexto,
        textoLogo,
        usarTextoLogo,
        logo: logo ? { mime: logo.mime, base64: logo.base64 } : null,
        extras: comCarrinho ? carrinho.map((c) => ({ processo: c.processo, marca: c.marca, classes: c.classes, situacao: c.situacao, titular: c.titular })) : [],
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Parecer pronto");
      router.push(`/admin/marcas/busca-ia/${r.id}`);
    });
  }

  const campo = "mt-1 block w-full rounded border border-border bg-surface px-2.5 py-2 text-sm font-normal";
  return (
    <form
      className="ui-card space-y-6 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        pesquisar();
      }}
    >
      <h2 className="text-[17px] font-semibold text-foreground">Pesquisa de Viabilidade de Marca</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">Elemento nominativo</legend>
        <p className="text-xs text-muted">Para depósitos de marcas Nominativas ou Mistas.</p>
        <label className="block text-sm font-medium text-foreground">
          Elemento nominativo da marca:
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </label>
        <p className="text-xs text-muted">Se a marca for Mista, este campo deve conter exatamente o texto que será depositado junto com o logo.</p>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={siglas} onChange={(e) => setSiglas(e.target.checked)} /> Esta marca contém siglas ou abreviações
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">Elemento visual (logo)</legend>
        <p className="text-xs text-muted">Para depósitos de marcas Mistas ou Figurativas.</p>
        {logo ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia local do logo */}
            <img src={logo.url} alt="Logo enviado" className="h-20 w-20 rounded border border-border object-contain" />
            <button type="button" onClick={() => setLogo(null)} className="ui-btn-secondary">
              <X className="h-4 w-4" aria-hidden /> Remover
            </button>
          </div>
        ) : (
          <label
            className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center text-sm text-muted hover:border-navy-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              escolherLogo(e.dataTransfer.files[0]);
            }}
          >
            <ImageUp className="h-6 w-6" aria-hidden />
            Arraste uma imagem ou clique para selecionar
            <span className="text-xs">PNG ou JPEG (máx 5MB).</span>
            <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => escolherLogo(e.target.files?.[0])} />
          </label>
        )}
        <label className="block text-sm font-medium text-foreground">
          Texto identificado no logo:
          <input value={textoLogo} onChange={(e) => setTextoLogo(e.target.value)} placeholder="A IA lê sozinha se ficar em branco" className={campo} />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={usarTextoLogo} onChange={(e) => setUsarTextoLogo(e.target.checked)} /> Usar texto do logo também na busca textual (se diferente do elemento nominativo)
        </label>
      </fieldset>

      <label className="block text-sm font-medium text-foreground">
        Onde a marca será usada:
        <textarea value={ondeUsar} onChange={(e) => setOndeUsar(e.target.value)} rows={2} placeholder="Ex.: academia de musculação; venda de suplementos" className={campo} />
        <span className="mt-1 block text-xs font-normal text-muted">Descreva a área de atuação ou classe(s) NCL para identificar classes relevantes.</span>
      </label>
      <label className="block text-sm font-medium text-foreground">
        Contexto adicional (opcional):
        <textarea value={contexto} onChange={(e) => setContexto(e.target.value)} rows={2} className={campo} />
        <span className="mt-1 block text-xs font-normal text-muted">Posicionamento, público-alvo ou estratégia para uma análise mais precisa.</span>
      </label>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={comCarrinho} onChange={(e) => setComCarrinho(e.target.checked)} disabled={!carrinho.length} /> Incluir marcas do carrinho da Busca Integrada na análise do parecer ({carrinho.length})
      </label>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button type="submit" disabled={pending} className="ui-btn">
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {pending ? "Buscando..." : "Pesquisar Viabilidade"}
        </button>
        {pending && <span className="text-sm text-muted">Consultando o INPI e escrevendo o parecer (até 1 minuto)…</span>}
      </div>
    </form>
  );
}

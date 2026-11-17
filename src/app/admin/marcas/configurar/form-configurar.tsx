"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { salvarConfigAction, type ConfigAcompanhamento } from "../actions";

// Formulário "Configurar acompanhamento", na ordem do Marca Acompanhada.

const ESCOPOS = [
  [1, "Marcas da mesma classe"],
  [2, "Marcas da mesma natureza"],
  [3, "Todas as marcas"],
] as const;
const SENSIBILIDADES = [
  [1, "Alta (marcas com >70% de semelhança)"],
  [2, "Média (marcas com >85% de semelhança)"],
  [3, "Baixa (marcas com >95% de semelhança)"],
] as const;
const PESOS = [
  [3, "Alta - gerar alertas sempre que esse termo for encontrado"],
  [2, "Média - somente gerar alertas quando encontrado com outros termos"],
  [1, "Baixa - ignorar esse termo na busca de colidência"],
] as const;

const Bloco = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="ui-card p-5">
    <h2 className="section-title mb-3">{titulo}</h2>
    {children}
  </section>
);
const Radio = ({ nome, valor, atual, rotulo, onChange, disabled }: { nome: string; valor: number; atual: number; rotulo: string; onChange: (v: number) => void; disabled?: boolean }) => (
  <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
    <input type="radio" name={nome} checked={atual === valor} onChange={() => onChange(valor)} disabled={disabled} className="h-4 w-4 accent-[var(--navy)]" />
    {rotulo}
  </label>
);
const listaTexto = (xs: string[]) => xs.join(", ");
const textoLista = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);

export function FormConfigurar({
  processo,
  nome,
  termos,
  clientes,
  equipe = [],
  inicial,
}: {
  processo: string;
  nome: string;
  termos: string[];
  clientes: { id: string; nome: string }[];
  equipe?: { id: string; nome: string }[];
  inicial: ConfigAcompanhamento;
}) {
  const router = useRouter();
  const [c, setC] = useState(inicial);
  const [extras, setExtras] = useState(listaTexto(inicial.colid_extras));
  const [ignorar, setIgnorar] = useState(listaTexto(inicial.colid_ignorar));
  const [pending, start] = useTransition();
  const muda = <K extends keyof ConfigAcompanhamento>(k: K, v: ConfigAcompanhamento[K]) => setC((x) => ({ ...x, [k]: v }));
  const manual = c.colidencia && !c.colid_auto;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await salvarConfigAction(processo, { ...c, colid_extras: textoLista(extras), colid_ignorar: textoLista(ignorar) });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Configurações salvas");
          router.push(`/admin/marcas/processos/${processo}`);
        });
      }}
      className="space-y-5"
    >
      <Bloco titulo="Tipos de acompanhamento">
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={c.avisar_cliente} onChange={(e) => muda("avisar_cliente", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--navy)]" />
            <span>
              <strong className="font-semibold">Processual</strong> - aviso sobre publicações do INPI referente a este processo de marca.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={c.colidencia} onChange={(e) => muda("colidencia", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--navy)]" />
            <span>
              <strong className="font-semibold">Colidência</strong> - aviso sobre marcas iguais ou semelhantes.
            </span>
          </label>
        </div>
      </Bloco>

      <Bloco titulo="Cliente e WhatsApp">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="ui-label">Cliente do portal</span>
            <select value={c.client_id ?? ""} onChange={(e) => muda("client_id", e.target.value || null)} className="ui-input">
              <option value="">— Sem cliente —</option>
              {clientes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="ui-label">Responsável na equipe</span>
            <select value={c.responsavel_id ?? ""} onChange={(e) => muda("responsavel_id", e.target.value || null)} className="ui-input">
              <option value="">— Ninguém (só escritório e grupo) —</option>
              {equipe.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">Quando sair despacho na revista do INPI, ele recebe o aviso no WhatsApp, junto com o número do escritório e o grupo PÓS VENDA & PRÉ PROTOCOLO.</span>
          </label>
          <label className="block">
            <span className="ui-label">Apelido da marca (para marca figurativa)</span>
            <input value={c.apelido ?? ""} onChange={(e) => muda("apelido", e.target.value)} placeholder={nome} className="ui-input" />
          </label>
          <label className="block">
            <span className="ui-label">Nome do contato no WhatsApp</span>
            <input value={c.contato_nome ?? ""} onChange={(e) => muda("contato_nome", e.target.value)} className="ui-input" />
          </label>
          <label className="block">
            <span className="ui-label">Número do WhatsApp (com DDD)</span>
            <input value={c.contato_numero ?? ""} onChange={(e) => muda("contato_numero", e.target.value)} placeholder="73 99999-9999" inputMode="tel" className="ui-input" />
          </label>
          <label className="block sm:col-span-2">
            <span className="ui-label">Observação</span>
            <textarea value={c.observacao ?? ""} onChange={(e) => muda("observacao", e.target.value)} rows={2} className="ui-input" />
          </label>
        </div>
      </Bloco>

      <Bloco titulo="Configurar colidência">
        <p className="mb-3 text-sm text-muted">
          A busca de colidência verifica semanalmente marcas semelhantes. A configuração pode ser automática ou manual. Na automática, analisamos os termos da marca e ajustamos parâmetros para alertar só nos termos mais distintos.
        </p>
        <label className="mb-4 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={c.colid_auto} disabled={!c.colidencia} onChange={(e) => muda("colid_auto", e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />
          Configurar a colidência de forma automática.
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-semibold">Escopo da busca</legend>
            {ESCOPOS.map(([v, r]) => (
              <Radio key={v} nome="escopo" valor={v} atual={c.colid_escopo} rotulo={r} onChange={(x) => muda("colid_escopo", x)} disabled={!manual} />
            ))}
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-semibold">Sensibilidade geral</legend>
            {SENSIBILIDADES.map(([v, r]) => (
              <Radio key={v} nome="sensibilidade" valor={v} atual={c.colid_sensibilidade} rotulo={r} onChange={(x) => muda("colid_sensibilidade", x)} disabled={!manual} />
            ))}
          </fieldset>
        </div>
        {termos.map((t) => (
          <fieldset key={t} className="mt-5 space-y-1.5">
            <legend className="mb-1 text-sm font-semibold">Importância do termo: &quot;{t}&quot;</legend>
            {PESOS.map(([v, r]) => (
              <Radio key={v} nome={`peso-${t}`} valor={v} atual={c.colid_termos[t] ?? 3} rotulo={r} onChange={(x) => muda("colid_termos", { ...c.colid_termos, [t]: x })} disabled={!manual} />
            ))}
          </fieldset>
        ))}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="ui-label">Termos adicionais (opcional)</span>
            <input value={extras} onChange={(e) => setExtras(e.target.value)} disabled={!manual} className="ui-input" placeholder="separados por vírgula" />
            <span className="mt-1 block text-xs text-muted">Termos que não fazem parte da marca mas que também devem gerar alertas (máximo de 8 termos).</span>
          </label>
          <label className="block">
            <span className="ui-label">Termos para ignorar (opcional)</span>
            <input value={ignorar} onChange={(e) => setIgnorar(e.target.value)} disabled={!manual} className="ui-input" placeholder="separados por vírgula" />
            <span className="mt-1 block text-xs text-muted">Termos que devem ser ignorados na busca (máximo de 8 termos).</span>
          </label>
        </div>
      </Bloco>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="ui-btn">
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Submeter configurações
        </button>
      </div>
    </form>
  );
}

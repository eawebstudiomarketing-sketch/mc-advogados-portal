"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { novoLeadAction } from "./actions";

// "Novo lead": cadastro à mão (indicação, ligação, Instagram…).

export function NovoLead({ equipe, eu }: { equipe: { id: string; nome: string }[]; eu: string }) {
  const caixa = useRef<HTMLDetailsElement>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <details ref={caixa} className="relative">
      <summary className="ui-btn inline-flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-sm">
        <Plus className="h-4 w-4" aria-hidden /> Novo lead
      </summary>
      <form
        action={(fd) =>
          iniciar(async () => {
            const r = await novoLeadAction(fd);
            if (r && !r.ok) toast.error(r.erro);
          })
        }
        className="absolute right-0 z-30 mt-2 grid w-[min(92vw,22rem)] gap-2.5 rounded-xl border border-border bg-surface p-4 shadow-lg"
      >
        <input name="nome" className="ui-input" placeholder="Nome" autoFocus />
        <input name="telefone" className="ui-input" placeholder="WhatsApp com DDD" inputMode="tel" />
        <input name="empresa" className="ui-input" placeholder="Empresa (opcional)" />
        <input name="email" type="email" className="ui-input" placeholder="E-mail (opcional)" />
        <select name="origem" className="ui-input" defaultValue="indicacao" aria-label="De onde veio">
          <option value="indicacao">Indicação</option>
          <option value="instagram">Instagram</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="ligacao">Ligação</option>
          <option value="evento">Evento</option>
          <option value="manual">Outro</option>
        </select>
        <select name="responsavel" className="ui-input" defaultValue={eu} aria-label="Responsável">
          {equipe.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <textarea name="observacoes" rows={2} className="ui-input" placeholder="Observações" />
        <button type="submit" disabled={enviando} className="ui-btn py-2 text-sm">
          {enviando ? "Criando…" : "Criar lead"}
        </button>
      </form>
    </details>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { telefoneBonito, type Lead } from "@/lib/crm/tipos";
import { salvarLeadAction } from "../actions";

// Dados do lead (editáveis): contato, responsável, valor, próximo retorno, etiquetas e observações.

const paraInput = (iso: string | null) => {
  if (!iso) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

export function DadosDoLead({ lead, equipe }: { lead: Lead; equipe: { id: string; nome: string }[] }) {
  const [salvando, iniciar] = useTransition();
  return (
    <form
      action={(fd) =>
        iniciar(async () => {
          const r = await salvarLeadAction(fd);
          if (r.ok) toast.success("Salvo.");
          else toast.error(r.erro);
        })
      }
      className="ui-card space-y-4 p-5"
      aria-labelledby="dados-lead"
    >
      <h2 id="dados-lead" className="section-title">
        Dados do lead
      </h2>
      <input type="hidden" name="id" value={lead.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="ui-label">Nome</span>
          <input name="nome" defaultValue={lead.nome ?? ""} className="ui-input" />
        </label>
        <label className="space-y-1.5">
          <span className="ui-label">Empresa / marca</span>
          <input name="empresa" defaultValue={lead.empresa ?? ""} className="ui-input" />
        </label>
        <label className="space-y-1.5">
          <span className="ui-label">WhatsApp</span>
          <input name="telefone" defaultValue={telefoneBonito(lead.telefone)} inputMode="tel" className="ui-input" />
        </label>
        <label className="space-y-1.5">
          <span className="ui-label">E-mail</span>
          <input name="email" type="email" defaultValue={lead.email ?? ""} className="ui-input" />
        </label>
        <label className="space-y-1.5">
          <span className="ui-label">Responsável</span>
          <select name="responsavel" defaultValue={lead.responsavel ?? ""} className="ui-input">
            <option value="">Sem responsável</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="ui-label">Valor da proposta (R$)</span>
          <input name="valor" defaultValue={lead.valor ? String(lead.valor).replace(".", ",") : ""} inputMode="decimal" placeholder="Ex.: 2.500" className="ui-input" />
        </label>
        <label className="space-y-1.5">
          <span className="ui-label">Próximo contato</span>
          <input name="proximo_contato" type="datetime-local" defaultValue={paraInput(lead.proximo_contato)} className="ui-input" />
        </label>
        <label className="space-y-1.5">
          <span className="ui-label">Etiquetas (separe por vírgula)</span>
          <input name="tags" defaultValue={lead.tags.join(", ")} placeholder="marca, urgente" className="ui-input" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="ui-label">Observações</span>
        <textarea name="observacoes" rows={3} defaultValue={lead.observacoes ?? ""} className="ui-input" />
      </label>
      <div className="flex justify-end">
        <button type="submit" disabled={salvando} className="ui-btn px-5 py-2 text-sm">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { updateProcessAction, type UpdateProcessState } from "../../actions";
import { PROCESS_AREA_LABEL, PROCESS_AREAS } from "@/lib/process-area";
import type { Process } from "@/lib/data/processes";
import { VoltarInput } from "@/components/nav/back-button";

// Editar processo (04/11/2026): todos os dados da capa são editáveis, inclusive
// as partes (polo ativo, polo passivo e outros), o cliente e o responsável.

const initialState: UpdateProcessState = { error: null };

type Polo = "ativo" | "passivo" | "outro";
type Parte = { nome: string; papel: string; polo: Polo };
const PAPEL_PADRAO: Record<Polo, string> = { ativo: "Autor", passivo: "Réu", outro: "Interessado" };
const POLOS: [Polo, string][] = [
  ["ativo", "Polo ativo"],
  ["passivo", "Polo passivo"],
  ["outro", "Outros (terceiros, advogados, interessados)"],
];

function EditorPartes({ inicial }: { inicial: Parte[] }) {
  const [partes, setPartes] = useState<Parte[]>(inicial);
  const [novo, setNovo] = useState<Record<Polo, string>>({ ativo: "", passivo: "", outro: "" });
  const incluir = (polo: Polo) => {
    const nome = novo[polo].trim();
    if (!nome) return;
    setPartes([...partes, { nome: nome.slice(0, 200), papel: PAPEL_PADRAO[polo], polo }]);
    setNovo({ ...novo, [polo]: "" });
  };
  const mudar = (i: number, p: Partial<Parte>) => setPartes(partes.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <div className="space-y-3">
      <input type="hidden" name="partes" value={JSON.stringify(partes)} />
      {POLOS.map(([polo, rotulo]) => (
        <div key={polo} className="rounded-xl border border-border p-3">
          <p className="mb-2 text-xs font-semibold text-foreground">{rotulo}</p>
          <ul className="space-y-1.5">
            {partes.map((p, i) =>
              p.polo !== polo ? null : (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <input value={p.nome} onChange={(e) => mudar(i, { nome: e.target.value })} aria-label="Nome da parte" className="ui-input min-w-40 flex-1 !py-1.5 text-sm" />
                  <input value={p.papel} onChange={(e) => mudar(i, { papel: e.target.value })} aria-label="Papel (ex.: Autor, Réu, Reclamante)" className="ui-input !w-36 !py-1.5 text-sm" />
                  <select value={p.polo} onChange={(e) => mudar(i, { polo: e.target.value as Polo })} aria-label="Polo" className="ui-input !w-auto !py-1.5 text-sm">
                    <option value="ativo">Ativo</option>
                    <option value="passivo">Passivo</option>
                    <option value="outro">Outro</option>
                  </select>
                  <button type="button" onClick={() => setPartes(partes.filter((_, k) => k !== i))} className="icon-btn" aria-label={`Tirar ${p.nome}`} data-tip="Tirar">
                    <X aria-hidden />
                  </button>
                </li>
              )
            )}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              value={novo[polo]}
              onChange={(e) => setNovo({ ...novo, [polo]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  incluir(polo);
                }
              }}
              placeholder="Nome (Enter para incluir)"
              aria-label={`Incluir no ${rotulo.toLowerCase()}`}
              className="ui-input min-w-0 flex-1 !py-1.5 text-sm"
            />
            <button type="button" onClick={() => incluir(polo)} disabled={!novo[polo].trim()} className="ui-btn-secondary px-2.5 py-1 text-xs">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Incluir
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EditProcessForm({
  process,
  clientes,
  equipe,
}: {
  process: Process;
  clientes: { id: string; name: string }[];
  equipe: { id: string; full_name: string }[];
}) {
  const [state, formAction, pending] = useActionState(updateProcessAction, initialState);
  const partes = ((Array.isArray(process.partes) ? process.partes : []) as Partial<Parte>[]).map((p) => ({
    nome: String(p.nome ?? ""),
    papel: String(p.papel ?? ""),
    polo: (p.polo === "ativo" || p.polo === "passivo" ? p.polo : "outro") as Polo,
  }));
  const campo = "ui-input";

  return (
    <form action={formAction} className="max-w-3xl space-y-5 ui-card p-6">
      <VoltarInput />
      <input type="hidden" name="id" value={process.id} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="numero_processo" className="ui-label">
            Número do processo
          </label>
          <input id="numero_processo" name="numero_processo" type="text" required defaultValue={process.numero_processo} className={campo} />
        </div>
        <div>
          <label htmlFor="titulo" className="ui-label">
            Título <span className="font-normal text-muted">· ex.: Fulano x Empresa</span>
          </label>
          <input id="titulo" name="titulo" type="text" defaultValue={process.titulo ?? ""} className={campo} />
        </div>

        <div>
          <label htmlFor="client_id" className="ui-label">
            Cliente
          </label>
          <select id="client_id" name="client_id" defaultValue={process.client_id ?? ""} className={campo}>
            <option value="">Sem cliente vinculado</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="responsible_id" className="ui-label">
            Responsável
          </label>
          <select id="responsible_id" name="responsible_id" defaultValue={process.responsible_id ?? ""} className={campo}>
            <option value="">Ninguém</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="area" className="ui-label">
            Área
          </label>
          <select id="area" name="area" defaultValue={process.area} className={campo}>
            {PROCESS_AREAS.map((area) => (
              <option key={area} value={area}>
                {PROCESS_AREA_LABEL[area]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="ui-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={process.status} className={campo}>
            {[...new Set(["ativo", "suspenso", "arquivado", "encerrado", "inativo", process.status])].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="classe" className="ui-label">
            Classe / ação
          </label>
          <input id="classe" name="classe" type="text" defaultValue={process.classe ?? ""} placeholder="Ex.: Procedimento Comum Cível" className={campo} />
        </div>
        <div>
          <label htmlFor="fase" className="ui-label">
            Fase
          </label>
          <input id="fase" name="fase" type="text" defaultValue={process.fase ?? ""} placeholder="Ex.: Instrução, Recurso, Execução" className={campo} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="vara_tribunal" className="ui-label">
            Vara / órgão / tribunal
          </label>
          <input id="vara_tribunal" name="vara_tribunal" type="text" defaultValue={process.vara_tribunal ?? ""} className={campo} />
        </div>

        <div>
          <label htmlFor="instancia" className="ui-label">
            Instância
          </label>
          <select id="instancia" name="instancia" defaultValue={process.instancia ? String(process.instancia) : ""} className={campo}>
            <option value="">Não informada</option>
            <option value="1">1º grau</option>
            <option value="2">2º grau / Turma recursal</option>
            <option value="3">Tribunal superior</option>
          </select>
        </div>
        <div>
          <label htmlFor="distribuido_em" className="ui-label">
            Distribuído em
          </label>
          <input id="distribuido_em" name="distribuido_em" type="date" defaultValue={process.distribuido_em ?? ""} className={campo} />
        </div>
        <div>
          <label htmlFor="valor_causa" className="ui-label">
            Valor da causa (R$)
          </label>
          <input
            id="valor_causa"
            name="valor_causa"
            type="text"
            inputMode="decimal"
            defaultValue={process.valor_causa != null ? Number(process.valor_causa).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}
            placeholder="0,00"
            className={campo}
          />
        </div>
      </div>

      <div>
        <p className="ui-label">Partes</p>
        <EditorPartes inicial={partes} />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="ui-btn w-full py-2.5">
        {pending ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}

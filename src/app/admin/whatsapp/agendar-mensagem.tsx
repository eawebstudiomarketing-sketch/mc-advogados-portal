"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { agendadasDaConversaAction, agendarMensagemAction, cancelarAgendadaAction, type AgendadaTela } from "./agendamentos-actions";

// Agendar mensagem nesta conversa (04/11/2026): uma vez, todo dia, dias úteis,
// dias da semana ou dia do mês. O Assistente também agenda ("manda bom dia no
// grupo da 3N toda segunda às 8h").

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

type Tipo = "unica" | "diaria" | "uteis" | "semanal" | "mensal";

export function AgendarMensagem({ jid, rotulo, textoInicial, onFechar, onAgendou }: { jid: string; rotulo: string; textoInicial: string; onFechar: () => void; onAgendou: () => void }) {
  const [lista, setLista] = useState<AgendadaTela[] | null>(null);
  const [texto, setTexto] = useState(textoInicial);
  const [tipo, setTipo] = useState<Tipo>("unica");
  const [data, setData] = useState(hojeBahia());
  const [hora, setHora] = useState("09:00");
  const [dias, setDias] = useState<number[]>([1]);
  const [diaMes, setDiaMes] = useState(1);
  const [ate, setAte] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    void agendadasDaConversaAction(jid).then(setLista);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [jid, onFechar]);

  function agendar() {
    const recorrencia =
      tipo === "unica"
        ? { tipo: "unica", data }
        : tipo === "diaria" || tipo === "uteis"
          ? { tipo: "diaria", uteis: tipo === "uteis", inicio: data }
          : tipo === "semanal"
            ? { tipo: "semanal", dias, inicio: data }
            : { tipo: "mensal", dia: diaMes, inicio: data };
    start(async () => {
      const r = await agendarMensagemAction({ jid, rotulo, texto, recorrencia, hora, ate: tipo === "unica" ? null : ate || null });
      if (!r.ok || !r.agendada) return void toast.error(r.erro ?? "Não foi possível agendar.");
      setLista((l) => [...(l ?? []), r.agendada!]);
      toast.success(`Agendada: ${r.agendada.quando}.`);
      onAgendou();
    });
  }
  function cancelar(a: AgendadaTela) {
    if (!confirm(`Cancelar a mensagem agendada (${a.quando})?`)) return;
    start(async () => {
      await cancelarAgendadaAction(a.id);
      setLista((l) => (l ?? []).filter((x) => x.id !== a.id));
    });
  }

  const sel = "ui-input !w-auto !py-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Agendar mensagem" onClick={onFechar}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <CalendarClock className="h-4 w-4 text-navy-3" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Agendar mensagem</p>
            <p className="truncate text-xs text-muted">Para {rotulo}. Sai pelo número do escritório, no horário da Bahia.</p>
          </div>
          <button type="button" onClick={onFechar} className="icon-btn" aria-label="Fechar">
            <X aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000} placeholder="Mensagem" className="ui-input text-sm" aria-label="Mensagem" />

          <div className="flex flex-wrap items-center gap-2">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className={sel} aria-label="Repetição">
              <option value="unica">Uma vez</option>
              <option value="diaria">Todo dia</option>
              <option value="uteis">Todo dia útil (seg–sex)</option>
              <option value="semanal">Toda semana</option>
              <option value="mensal">Todo mês</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              {tipo === "unica" ? "em" : "a partir de"}
              <input type="date" value={data} min={hojeBahia()} onChange={(e) => setData(e.target.value)} className={sel} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              às
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={sel} />
            </label>
          </div>

          {tipo === "semanal" && (
            <span className="flex gap-0.5" role="group" aria-label="Dias da semana">
              {DIAS.map((d, i) => {
                const on = dias.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const novo = on ? dias.filter((x) => x !== i) : [...dias, i];
                      if (novo.length) setDias(novo.sort());
                    }}
                    className={`h-7 w-7 rounded-lg text-[11px] font-semibold transition-colors ${on ? "bg-navy text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </span>
          )}
          {tipo === "mensal" && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              no dia
              <select value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))} className={sel}>
                {Array.from({ length: 31 }, (_, k) => k + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              do mês (mês com menos dias: no último)
            </label>
          )}
          {tipo !== "unica" && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              repetir até (opcional)
              <input type="date" value={ate} min={data} onChange={(e) => setAte(e.target.value)} className={sel} />
            </label>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={agendar} disabled={pending || !texto.trim()} className="ui-btn px-3 py-1.5 text-xs">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CalendarClock className="h-3.5 w-3.5" aria-hidden />} Agendar
            </button>
          </div>

          <div className="border-t border-border pt-3">
            <p className="eyebrow mb-1.5">Agendadas nesta conversa</p>
            {lista === null ? (
              <p className="text-xs text-muted">Carregando…</p>
            ) : lista.length === 0 ? (
              <p className="text-xs text-muted">Nenhuma mensagem agendada aqui.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {lista.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-foreground">{a.quando}</span>
                      <span className="block text-[11px] text-muted">
                        próxima: {dataHora(a.proxima)}
                        {a.envios > 0 && ` · já saiu ${a.envios}x`}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-foreground/80">{a.texto}</span>
                    </span>
                    <button type="button" onClick={() => cancelar(a)} disabled={pending} className="icon-btn icon-btn-danger" aria-label="Cancelar mensagem agendada" data-tip="Cancelar">
                      <Trash2 aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

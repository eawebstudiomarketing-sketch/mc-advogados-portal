// Prazo com cor (item 22 da auditoria, 30/10/2026), nas mesmas regras da
// lista de atividades: vermelho atrasado, laranja hoje, dourado em até 3 dias,
// neutro depois. Encerrado (pago, concluído) fica cinza só com a data.

const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const diasAte = (iso: string) => Math.round((Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) - Date.parse(`${hojeBahia()}T12:00:00Z`)) / 86_400_000);
const dataCurta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function ChipPrazo({ data, encerrado = false }: { data: string | null; encerrado?: boolean }) {
  if (!data) return <span className="text-xs text-muted">Sem data</span>;
  const d = diasAte(data);
  const [cor, texto] = encerrado
    ? ["bg-surface-2 text-muted", dataCurta(data)]
    : d < 0
      ? ["bg-status-danger-bg text-status-danger", d === -1 ? "Venceu ontem" : `Atrasado ${-d} dias`]
      : d === 0
        ? ["bg-status-pending-bg text-status-pending", "Hoje"]
        : d <= 3
          ? ["bg-gold-soft text-gold-ink", d === 1 ? "Amanhã" : `Em ${d} dias`]
          : ["bg-surface-2 text-foreground/75", dataCurta(data)];
  return (
    <span title={dataCurta(data)} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${cor}`}>
      {texto}
    </span>
  );
}

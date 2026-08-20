import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { formatCurrency } from "@/lib/mock-data";
import type { TimeEntry } from "@/lib/data/time-entries";
import type { Activity } from "@/lib/data/activities";
import type { FinancialRecord } from "@/lib/data/financial";

const MESES = [
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { marginBottom: 24, borderBottom: "2pt solid #0B2545", paddingBottom: 12 },
  brand: { fontSize: 14, fontWeight: 700, color: "#0B2545" },
  title: { fontSize: 18, fontWeight: 700, marginTop: 8 },
  subtitle: { fontSize: 11, color: "#555", marginTop: 2 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: "#0B2545", marginBottom: 6 },
  statsRow: { flexDirection: "row", gap: 16, marginTop: 6 },
  statBox: { flex: 1, padding: 10, backgroundColor: "#f5f6f8", borderRadius: 4 },
  statLabel: { fontSize: 8, color: "#666" },
  statValue: { fontSize: 14, fontWeight: 700, marginTop: 2 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottom: "0.5pt solid #e0e0e0",
  },
  rowLabel: { flex: 3 },
  rowMeta: { flex: 2, color: "#666" },
  rowValue: { flex: 1, textAlign: "right" },
  empty: { color: "#999", fontStyle: "italic" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#999", textAlign: "center" },
});

export function MonthlyReportDocument({
  clientName,
  referenceMonth,
  referenceYear,
  timeEntries,
  activities,
  financialRecords,
}: {
  clientName: string;
  referenceMonth: number;
  referenceYear: number;
  timeEntries: TimeEntry[];
  activities: Activity[];
  financialRecords: FinancialRecord[];
}) {
  const totalHoras = timeEntries.reduce((s, t) => s + Number(t.hours), 0);
  const totalFaturado = financialRecords.reduce((s, f) => s + Number(f.amount), 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>MC Advogados</Text>
          <Text style={styles.title}>Relatório mensal</Text>
          <Text style={styles.subtitle}>
            {clientName} · {MESES[referenceMonth]} de {referenceYear}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>HORAS TRABALHADAS</Text>
            <Text style={styles.statValue}>{totalHoras}h</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>ATIVIDADES NO MÊS</Text>
            <Text style={styles.statValue}>{activities.length}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>LANÇAMENTOS FINANCEIROS</Text>
            <Text style={styles.statValue}>{formatCurrency(totalFaturado)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Horas trabalhadas</Text>
          {timeEntries.length === 0 && <Text style={styles.empty}>Nenhum lançamento de horas no mês.</Text>}
          {timeEntries.map((t) => (
            <View key={t.id} style={styles.row}>
              <Text style={styles.rowLabel}>{t.description}</Text>
              <Text style={styles.rowMeta}>{ACTIVITY_TYPE_LABEL[t.activity_type]}</Text>
              <Text style={styles.rowValue}>{t.hours}h</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Atividades</Text>
          {activities.length === 0 && <Text style={styles.empty}>Nenhuma atividade no mês.</Text>}
          {activities.map((a) => (
            <View key={a.id} style={styles.row}>
              <Text style={styles.rowLabel}>{a.title}</Text>
              <Text style={styles.rowMeta}>{ACTIVITY_TYPE_LABEL[a.type]}</Text>
              <Text style={styles.rowValue}>{a.status}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financeiro</Text>
          {financialRecords.length === 0 && <Text style={styles.empty}>Nenhum lançamento financeiro no mês.</Text>}
          {financialRecords.map((f) => (
            <View key={f.id} style={styles.row}>
              <Text style={styles.rowLabel}>{f.description}</Text>
              <Text style={styles.rowMeta}>{f.status}</Text>
              <Text style={styles.rowValue}>{formatCurrency(Number(f.amount))}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          MC Advogados · Relatório gerado automaticamente pelo portal do cliente
        </Text>
      </Page>
    </Document>
  );
}

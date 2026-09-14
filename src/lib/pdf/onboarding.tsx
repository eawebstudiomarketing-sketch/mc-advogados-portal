import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  ONBOARDING_STAGES,
  ONBOARDING_OBJECTIVE,
  ONBOARDING_INFO_ESSENCIAIS,
  ONBOARDING_CHECKLIST_CONCLUSAO,
  ONBOARDING_REGRA_OURO,
  MC_LETTERHEAD,
  MC_FOOTER_VALORES,
  type OnboardingAnswers,
} from "@/lib/onboarding-schema";

// Réplica, em @react-pdf/renderer, da skill HTML "Onboarding da Assessoria
// Jurídica" (html2pdf.js) já usada pelo escritório. Fiel no conteúdo fixo e
// nas cores/timbrado; a tabela de 3 colunas do HTML virou um bloco por etapa
// (cabeçalho + pergunta/resposta à esquerda, ações à direita) porque
// react-pdf pagina mal uma linha de tabela muito alta partida ao meio —
// isso mantém a mesma informação com paginação confiável entre etapas.

const NAVY = "#001a3d";
const GOLD = "#d4af37";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#333" },

  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: NAVY,
    color: "white",
    padding: 16,
    borderBottom: `3pt solid ${GOLD}`,
  },
  logoBox: {
    width: 34,
    height: 34,
    backgroundColor: "white",
    color: NAVY,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 700,
    marginRight: 10,
  },
  logoRow: { flexDirection: "row", alignItems: "center" },
  brandName: { fontSize: 14, fontWeight: 700, color: "white" },
  brandSubtitle: { fontSize: 8, color: "white", letterSpacing: 1, marginTop: 2 },
  contato: { textAlign: "right", fontSize: 7.5, color: "white", lineHeight: 1.5 },

  title: { fontSize: 18, fontWeight: 700, color: NAVY, marginTop: 18, textTransform: "uppercase" },
  subtitle: { fontSize: 10, color: "#666", marginTop: 4, marginBottom: 12 },

  objetivoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#f9f9f9",
    borderLeft: `3pt solid ${GOLD}`,
    padding: 12,
    marginBottom: 16,
  },
  objetivoIcon: {
    width: 28,
    height: 28,
    backgroundColor: NAVY,
    color: GOLD,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    fontSize: 14,
  },
  objetivoTitle: { fontSize: 9, fontWeight: 700, color: NAVY, textTransform: "uppercase", marginBottom: 4 },
  objetivoText: { fontSize: 9, color: "#666", lineHeight: 1.5 },

  stage: { marginBottom: 14, border: "1pt solid #e0e0e0", borderRadius: 4 },
  stageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: NAVY,
    color: "white",
    padding: 8,
  },
  stageNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GOLD,
    color: NAVY,
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    fontWeight: 700,
  },
  stageName: { fontSize: 10, fontWeight: 700, textTransform: "uppercase" },
  stageBody: { flexDirection: "row", padding: 10, gap: 12 },
  stageCol: { flex: 1 },
  colLabel: { fontSize: 8, fontWeight: 700, color: NAVY, textTransform: "uppercase", marginBottom: 6 },

  questionBlock: { marginBottom: 8 },
  questionText: { fontSize: 8.5, fontWeight: 700, color: "#333", marginBottom: 3 },
  answerBox: {
    borderLeft: `2pt solid ${GOLD}`,
    backgroundColor: "#f9f9f9",
    padding: 5,
    minHeight: 16,
  },
  answerText: { fontSize: 8.5, color: "#222" },
  answerEmpty: { fontSize: 8.5, color: "#aaa", fontStyle: "italic" },

  actionRow: { flexDirection: "row", gap: 5, marginBottom: 5 },
  bullet: { color: GOLD, fontWeight: 700, fontSize: 8.5 },
  actionText: { fontSize: 8.5, color: "#666", flex: 1 },

  infoSection: { flexDirection: "row", gap: 12, marginBottom: 16 },
  infoBox: { flex: 1, border: "1pt solid #e0e0e0", borderRadius: 4, padding: 10 },
  infoBoxTitle: { fontSize: 8.5, fontWeight: 700, color: GOLD, textTransform: "uppercase", marginBottom: 8 },
  infoBoxItem: { fontSize: 8.5, color: "#666", marginBottom: 5 },

  regraOuro: {
    border: `1.5pt solid ${GOLD}`,
    borderRadius: 4,
    backgroundColor: "#f9f9f9",
    padding: 16,
    textAlign: "center",
    marginBottom: 16,
  },
  regraOuroTitle: { fontSize: 9, fontWeight: 700, color: GOLD, textTransform: "uppercase", marginBottom: 6 },
  regraOuroText: { fontSize: 9, color: "#666", marginBottom: 4 },
  regraOuroDestaque: { fontSize: 9, fontWeight: 700, color: NAVY },

  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: NAVY,
    color: "white",
    padding: 12,
    borderTop: `3pt solid ${GOLD}`,
    fontSize: 7,
  },
  footerLeft: { flex: 1, lineHeight: 1.5 },
  footerRight: { flex: 1, flexDirection: "row", gap: 10 },
  footerItem: { flex: 1, textAlign: "center" },
});

function Letterhead() {
  return (
    <View style={styles.letterhead}>
      <View style={styles.logoRow}>
        <Text style={styles.logoBox}>MC</Text>
        <View>
          <Text style={styles.brandName}>{MC_LETTERHEAD.nome}</Text>
          <Text style={styles.brandSubtitle}>{MC_LETTERHEAD.subtitulo}</Text>
        </View>
      </View>
      <View style={styles.contato}>
        <Text>{MC_LETTERHEAD.telefone}</Text>
        <Text>{MC_LETTERHEAD.email}</Text>
        <Text>{MC_LETTERHEAD.endereco}</Text>
        <Text>{MC_LETTERHEAD.cep}</Text>
        <Text>{MC_LETTERHEAD.oab}</Text>
      </View>
    </View>
  );
}

export function OnboardingDocument({ clientName, answers }: { clientName: string; answers: OnboardingAnswers }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Letterhead />

        <Text style={styles.title}>Onboarding da Assessoria Jurídica</Text>
        <Text style={styles.subtitle}>
          Guia de Perguntas e Ações · Cliente: {clientName}
        </Text>

        <View style={styles.objetivoBox}>
          <View style={styles.objetivoIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.objetivoTitle}>Objetivo</Text>
            <Text style={styles.objetivoText}>{ONBOARDING_OBJECTIVE}</Text>
          </View>
        </View>

        {/* Emoji (🎯🤝👑 etc) ficam de fora do PDF — a Helvetica do
        @react-pdf/renderer não tem esses glyphs e eles saem corrompidos
        (mojibake) no PDF final. No formulário em tela (onboarding-form.tsx)
        eles aparecem normalmente, ali é o navegador que renderiza a fonte. */}
        {ONBOARDING_STAGES.map((stage) => (
          <View key={stage.id} style={styles.stage} wrap={false}>
            <View style={styles.stageHeader}>
              <Text style={styles.stageNum}>{stage.number}</Text>
              <Text style={styles.stageName}>{stage.name}</Text>
            </View>
            <View style={styles.stageBody}>
              <View style={styles.stageCol}>
                <Text style={styles.colLabel}>Perguntas Principais</Text>
                {stage.questions.map((q) => (
                  <View key={q.id} style={styles.questionBlock}>
                    <Text style={styles.questionText}>{q.text}</Text>
                    <View style={styles.answerBox}>
                      {answers[q.id]?.trim() ? (
                        <Text style={styles.answerText}>{answers[q.id]}</Text>
                      ) : (
                        <Text style={styles.answerEmpty}>Não respondido.</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.stageCol}>
                <Text style={styles.colLabel}>Ações a Serem Realizadas</Text>
                {stage.actions.map((action, i) => (
                  <View key={i} style={styles.actionRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.actionText}>{action}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}

        <View style={styles.infoSection} wrap={false}>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>Informações Essenciais</Text>
            {ONBOARDING_INFO_ESSENCIAIS.map((item, i) => (
              <Text key={i} style={styles.infoBoxItem}>
                • {item}
              </Text>
            ))}
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>Checklist de Conclusão do Onboarding</Text>
            {ONBOARDING_CHECKLIST_CONCLUSAO.map((item, i) => (
              <Text key={i} style={styles.infoBoxItem}>
                • {item}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.regraOuro} wrap={false}>
          <Text style={styles.regraOuroTitle}>Regra de Ouro MC</Text>
          <Text style={styles.regraOuroText}>{ONBOARDING_REGRA_OURO.text}</Text>
          <Text style={styles.regraOuroDestaque}>{ONBOARDING_REGRA_OURO.destaque}</Text>
        </View>

        <View style={styles.footer} wrap={false}>
          <View style={styles.footerLeft}>
            <Text>{MC_LETTERHEAD.telefone}</Text>
            <Text>{MC_LETTERHEAD.email}</Text>
            <Text>{MC_LETTERHEAD.endereco}</Text>
            <Text>{MC_LETTERHEAD.cep}</Text>
            <Text>{MC_LETTERHEAD.oab}</Text>
          </View>
          <View style={styles.footerRight}>
            {MC_FOOTER_VALORES.map((v, i) => (
              <View key={i} style={styles.footerItem}>
                <Text>{v.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

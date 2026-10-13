import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import {
  ONBOARDING_STAGES,
  ONBOARDING_OBJECTIVE,
  ONBOARDING_INFO_ESSENCIAIS,
  ONBOARDING_CHECKLIST_CONCLUSAO,
  ONBOARDING_REGRA_OURO,
  MC_LETTERHEAD,
  MC_FOOTER_VALORES,
  type OnboardingAnswers,
  type OnboardingStage,
} from "@/lib/onboarding-schema";
import { ONBOARDING_MARK_PNG } from "./onboarding-mark";

// PDF no visual do modelo "Onboarding MC Adv.html" (out/2026): capa navy com
// timbre e objetivo, um cartão por etapa (número, "Etapa X de 7", contador de
// respondidas, perguntas numeradas com a resposta e coluna de ações) e o
// fechamento com informações essenciais, checklist, Regra de Ouro e contato.
// Emojis ficam de fora: a Helvetica do @react-pdf não tem esses glifos.

const NAVY = "#091827";
const NAVY2 = "#11273b";
const GOLD = "#c6a24f";
const GOLD2 = "#e1cd93";
const GOLD_TXT = "#8a6c2c";
const PAPER = "#f7f4ee";
const INK = "#1b2732";
const MUTED = "#66727d";
const LINE = "#e3e6ea";

const dois = (n: number) => String(n).padStart(2, "0");

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 28, fontSize: 9, fontFamily: "Helvetica", color: INK, backgroundColor: PAPER },

  // capa
  capa: { backgroundColor: NAVY2, borderRadius: 14, padding: 20, marginBottom: 14 },
  capaTopo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  marcaLinha: { flexDirection: "row", alignItems: "center" },
  marca: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  marcaNome: { fontSize: 7.5, color: GOLD2, letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  marcaSub: { fontSize: 13, color: "#ffffff", letterSpacing: 1.5, fontFamily: "Helvetica-Bold", marginTop: 1 },
  marcaGuia: { fontSize: 6.5, color: "#a9b4c0", letterSpacing: 1.6, marginTop: 2 },
  contato: { borderRadius: 8, border: "0.6pt solid #2c4258", paddingVertical: 6, paddingHorizontal: 9 },
  contatoTxt: { fontSize: 6.8, color: "#c9d1da", textAlign: "right", lineHeight: 1.45 },
  painel: { marginTop: 16, borderRadius: 12, border: "0.6pt solid #2c4258", backgroundColor: "#173049", padding: 14 },
  selo: { alignSelf: "flex-start", border: `0.6pt solid ${GOLD}`, borderRadius: 10, paddingVertical: 2.5, paddingHorizontal: 8, fontSize: 6.5, color: GOLD2, letterSpacing: 1.5, fontFamily: "Helvetica-Bold" },
  titulo: { marginTop: 8, fontSize: 18, color: "#ffffff" },
  rotulo: { marginTop: 10, fontSize: 6.5, color: "#a9b4c0", letterSpacing: 1.6 },
  cliente: { marginTop: 2, fontSize: 11, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  objetivo: { marginTop: 4, borderRadius: 9, backgroundColor: "#1d3953", padding: 9 },
  objetivoTit: { fontSize: 6.8, color: GOLD2, letterSpacing: 1.5, fontFamily: "Helvetica-Bold" },
  objetivoTxt: { marginTop: 3, fontSize: 8.5, color: "#e6ebf0", lineHeight: 1.45 },
  resumo: { marginTop: 10, flexDirection: "row", alignItems: "center" },
  barra: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#2c4258" },
  barraCheia: { height: 4, borderRadius: 2, backgroundColor: GOLD },
  resumoTxt: { marginLeft: 8, fontSize: 7.5, color: "#c9d1da" },

  // etapa
  etapa: { backgroundColor: "#ffffff", borderRadius: 12, border: `0.6pt solid ${LINE}`, marginBottom: 12 },
  etapaTopo: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 14, borderBottom: `0.6pt solid ${LINE}`, backgroundColor: "#fbf9f4", borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  etapaNum: { width: 26, height: 26, borderRadius: 7, backgroundColor: NAVY2, color: "#ffffff", fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 6.5 },
  etapaDe: { fontSize: 6.5, color: GOLD_TXT, letterSpacing: 1.6, fontFamily: "Helvetica-Bold" },
  etapaNome: { fontSize: 11.5, color: NAVY, marginTop: 1 },
  contador: { marginLeft: "auto", borderRadius: 9, border: `0.6pt solid ${GOLD2}`, backgroundColor: "#f6efdc", paddingVertical: 3, paddingHorizontal: 8, fontSize: 7, color: "#7a5f22", fontFamily: "Helvetica-Bold" },
  contadorCheio: { backgroundColor: GOLD, color: "#ffffff", borderColor: GOLD },
  corpo: { flexDirection: "column" },
  perguntas: { paddingVertical: 2, paddingHorizontal: 14 },
  pergunta: { paddingVertical: 7, borderBottom: `0.5pt solid ${LINE}` },
  perguntaLinha: { flexDirection: "row", alignItems: "flex-start" },
  perguntaNum: { width: 18, marginRight: 7, borderRadius: 4, backgroundColor: "#f6efdc", color: "#7a5f22", fontSize: 6.8, fontFamily: "Helvetica-Bold", textAlign: "center", paddingVertical: 2 },
  perguntaTxt: { flex: 1, fontSize: 8.6, color: NAVY, fontFamily: "Helvetica-Bold", lineHeight: 1.35 },
  resposta: { marginTop: 4, marginLeft: 25, borderRadius: 7, border: `0.5pt solid ${LINE}`, backgroundColor: "#fdfcf9", paddingVertical: 5, paddingHorizontal: 7 },
  respostaTxt: { fontSize: 8.5, color: INK, lineHeight: 1.45 },
  respostaVazia: { fontSize: 8.3, color: "#a3abb3", fontFamily: "Helvetica-Oblique" },
  acoes: { backgroundColor: "#f8f5ef", borderBottom: `0.6pt solid ${LINE}`, paddingVertical: 8, paddingHorizontal: 14 },
  acoesCaixa: { backgroundColor: "#ffffff", borderRadius: 8, border: `0.5pt solid ${LINE}`, padding: 8 },
  acoesTit: { fontSize: 6.5, color: GOLD_TXT, letterSpacing: 1.4, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  acao: { flexDirection: "row", width: "50%", paddingVertical: 2.5, paddingRight: 8 },
  acoesLista: { flexDirection: "row", flexWrap: "wrap" },
  ponto: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: GOLD, marginTop: 3.2, marginRight: 5 },
  acaoTxt: { flex: 1, fontSize: 7.8, color: MUTED, lineHeight: 1.35 },

  // fechamento
  duas: { flexDirection: "row", marginBottom: 12 },
  caixa: { flex: 1, backgroundColor: "#ffffff", borderRadius: 12, border: `0.6pt solid ${LINE}`, padding: 12 },
  caixaTit: { fontSize: 10.5, color: NAVY, marginBottom: 6 },
  item: { flexDirection: "row", marginBottom: 4 },
  itemTxt: { flex: 1, fontSize: 8.2, color: MUTED, lineHeight: 1.35 },
  regra: { backgroundColor: NAVY2, borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 12 },
  regraTit: { fontSize: 7, color: GOLD2, letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  regraTxt: { marginTop: 6, fontSize: 9.5, color: "#e6ebf0", textAlign: "center" },
  regraDestaque: { marginTop: 4, fontSize: 11, color: GOLD2, fontFamily: "Helvetica-Bold", letterSpacing: 0.8 },
  rodape: { backgroundColor: "#ffffff", borderRadius: 12, border: `0.6pt solid ${LINE}`, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rodapeTit: { fontSize: 9.5, color: NAVY, marginBottom: 3 },
  rodapeTxt: { fontSize: 7.3, color: MUTED, lineHeight: 1.45 },
  valores: { flexDirection: "column", alignItems: "flex-end" },
  valor: { borderRadius: 8, border: `0.5pt solid ${GOLD2}`, backgroundColor: "#fbf7ec", paddingVertical: 2.5, paddingHorizontal: 7, fontSize: 6.3, color: "#7a5f22", fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 3 },

  numeroPagina: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7, color: "#9aa3ad", textAlign: "center" },
});

function Ponto() {
  return <View style={s.ponto} />;
}

export function OnboardingDocument({
  clientName,
  answers,
  stages = ONBOARDING_STAGES,
}: {
  clientName: string;
  answers: OnboardingAnswers;
  stages?: OnboardingStage[];
}) {
  const total = stages.reduce((n, st) => n + st.questions.length, 0);
  const respondidas = stages.reduce((n, st) => n + st.questions.filter((q) => answers[q.id]?.trim()).length, 0);
  const pct = total ? Math.round((respondidas / total) * 100) : 0;

  return (
    <Document title={`Onboarding — ${clientName}`} author="MC Advogados">
      <Page size="A4" style={s.page} wrap>
        {/* capa */}
        <View style={s.capa} wrap={false}>
          <View style={s.capaTopo}>
            <View style={s.marcaLinha}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não aceita alt */}
              <Image src={ONBOARDING_MARK_PNG} style={s.marca} />
              <View>
                <Text style={s.marcaNome}>{MC_LETTERHEAD.nome}</Text>
                <Text style={s.marcaSub}>{MC_LETTERHEAD.subtitulo}</Text>
                <Text style={s.marcaGuia}>ONBOARDING DA ASSESSORIA JURÍDICA</Text>
              </View>
            </View>
            <View style={s.contato}>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.telefone}</Text>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.email}</Text>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.endereco}</Text>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.cep}</Text>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.oab}</Text>
            </View>
          </View>

          <View style={s.painel}>
            <Text style={s.selo}>GUIA DE PERGUNTAS E AÇÕES</Text>
            <Text style={s.titulo}>Onboarding da Assessoria Jurídica</Text>
            <Text style={s.rotulo}>CLIENTE</Text>
            <Text style={s.cliente}>{clientName}</Text>
            <Text style={s.rotulo}>OBJETIVO</Text>
            <View style={s.objetivo}>
              <Text style={s.objetivoTit}>IMPLANTAÇÃO COMPLETA</Text>
              <Text style={s.objetivoTxt}>{ONBOARDING_OBJECTIVE}</Text>
            </View>
            <View style={s.resumo}>
              <View style={s.barra}>
                <View style={[s.barraCheia, { width: `${pct}%` }]} />
              </View>
              <Text style={s.resumoTxt}>
                {respondidas} de {total} perguntas respondidas ({pct}%)
              </Text>
            </View>
          </View>
        </View>

        {/* etapas */}
        {stages.map((stage) => {
          const feitas = stage.questions.filter((q) => answers[q.id]?.trim()).length;
          const cheio = feitas === stage.questions.length;
          return (
            <View key={stage.id} style={s.etapa} wrap>
              <View style={s.etapaTopo} wrap={false} minPresenceAhead={150}>
                <Text style={s.etapaNum}>{stage.number}</Text>
                <View style={{ marginLeft: 9 }}>
                  <Text style={s.etapaDe}>
                    ETAPA {stage.number} DE {stages.length}
                  </Text>
                  <Text style={s.etapaNome}>{stage.name}</Text>
                </View>
                <Text style={cheio ? [s.contador, s.contadorCheio] : s.contador}>
                  {feitas}/{stage.questions.length} respondidas
                </Text>
              </View>
              <View style={s.corpo}>
                <View style={s.acoes}>
                  <View style={s.acoesCaixa} wrap={false}>
                    <Text style={s.acoesTit}>AÇÕES A SEREM REALIZADAS</Text>
                    <View style={s.acoesLista}>
                      {stage.actions.map((acao, i) => (
                        <View key={i} style={s.acao}>
                          <Ponto />
                          <Text style={s.acaoTxt}>{acao}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <View style={s.perguntas}>
                  {stage.questions.map((q, i) => (
                    <View key={q.id} style={i === stage.questions.length - 1 ? [s.pergunta, { borderBottom: "none" }] : s.pergunta} wrap={false}>
                      <View style={s.perguntaLinha}>
                        <Text style={s.perguntaNum}>{dois(i + 1)}</Text>
                        <Text style={s.perguntaTxt}>{q.text}</Text>
                      </View>
                      <View style={s.resposta}>
                        {answers[q.id]?.trim() ? (
                          <Text style={s.respostaTxt}>{answers[q.id]}</Text>
                        ) : (
                          <Text style={s.respostaVazia}>Não respondido.</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          );
        })}

        {/* fechamento */}
        <View style={s.duas} wrap={false}>
          <View style={[s.caixa, { marginRight: 6 }]}>
            <Text style={s.caixaTit}>Informações Essenciais</Text>
            {ONBOARDING_INFO_ESSENCIAIS.map((item, i) => (
              <View key={i} style={s.item}>
                <Ponto />
                <Text style={s.itemTxt}>{item}</Text>
              </View>
            ))}
          </View>
          <View style={[s.caixa, { marginLeft: 6 }]}>
            <Text style={s.caixaTit}>Checklist de Conclusão do Onboarding</Text>
            {ONBOARDING_CHECKLIST_CONCLUSAO.map((item, i) => (
              <View key={i} style={s.item}>
                <Ponto />
                <Text style={s.itemTxt}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.regra} wrap={false}>
          <Text style={s.regraTit}>REGRA DE OURO MC</Text>
          <Text style={s.regraTxt}>{ONBOARDING_REGRA_OURO.text}</Text>
          <Text style={s.regraDestaque}>{ONBOARDING_REGRA_OURO.destaque}</Text>
        </View>

        <View style={s.rodape} wrap={false}>
          <View>
            <Text style={s.rodapeTit}>Contato</Text>
            <Text style={s.rodapeTxt}>
              {MC_LETTERHEAD.telefone} · {MC_LETTERHEAD.email}
            </Text>
            <Text style={s.rodapeTxt}>
              {MC_LETTERHEAD.endereco} · {MC_LETTERHEAD.cep} · {MC_LETTERHEAD.oab}
            </Text>
          </View>
          <View style={s.valores}>
            {MC_FOOTER_VALORES.map((v) => (
              <Text key={v.text} style={s.valor}>
                {v.text}
              </Text>
            ))}
          </View>
        </View>

        <Text
          style={s.numeroPagina}
          render={({ pageNumber, totalPages }) => `Onboarding · ${clientName} · Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

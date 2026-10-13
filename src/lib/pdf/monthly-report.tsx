import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { MC_LETTERHEAD } from "@/lib/onboarding-schema";
import type { Activity } from "@/lib/data/activities";
import { ONBOARDING_MARK_PNG } from "./onboarding-mark";

// Relatório mensal enxuto (out/2026), no mesmo visual do onboarding novo:
// capa navy com timbre e três blocos de atividades — concluídas no mês,
// em andamento e a fazer. Horas e financeiro saíram do relatório.

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const NAVY = "#091827";
const NAVY2 = "#11273b";
const GOLD = "#c6a24f";
const GOLD2 = "#e1cd93";
const GOLD_TXT = "#8a6c2c";
const PAPER = "#f7f4ee";
const INK = "#1b2732";
const MUTED = "#66727d";
const LINE = "#e3e6ea";

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 28, fontSize: 9, fontFamily: "Helvetica", color: INK, backgroundColor: PAPER },

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
  numeros: { marginTop: 12, flexDirection: "row" },
  numero: { flex: 1, borderRadius: 9, backgroundColor: "#1d3953", paddingVertical: 8, paddingHorizontal: 10, marginRight: 8 },
  numeroValor: { fontSize: 16, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  numeroRotulo: { marginTop: 2, fontSize: 6.5, color: GOLD2, letterSpacing: 1.3, fontFamily: "Helvetica-Bold" },

  bloco: { backgroundColor: "#ffffff", borderRadius: 12, border: `0.6pt solid ${LINE}`, marginBottom: 12 },
  blocoTopo: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 14, borderBottom: `0.6pt solid ${LINE}`, backgroundColor: "#fbf9f4", borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  blocoMarca: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  blocoNome: { fontSize: 11.5, color: NAVY },
  blocoDica: { fontSize: 7, color: MUTED, marginTop: 1 },
  contador: { marginLeft: "auto", borderRadius: 9, border: `0.6pt solid ${GOLD2}`, backgroundColor: "#f6efdc", paddingVertical: 3, paddingHorizontal: 8, fontSize: 7, color: "#7a5f22", fontFamily: "Helvetica-Bold" },
  lista: { paddingHorizontal: 14, paddingVertical: 2 },
  item: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 7, borderBottom: `0.5pt solid ${LINE}` },
  itemUltimo: { borderBottom: "0pt solid #ffffff" },
  ponto: { width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD, marginTop: 3.5, marginRight: 7 },
  itemTitulo: { fontSize: 9, color: NAVY, fontFamily: "Helvetica-Bold", lineHeight: 1.35 },
  itemDesc: { marginTop: 2, fontSize: 8, color: MUTED, lineHeight: 1.4 },
  itemMeta: { width: 90, textAlign: "right", fontSize: 7.3, color: GOLD_TXT, fontFamily: "Helvetica-Bold" },
  vazio: { paddingVertical: 9, fontSize: 8.3, color: "#a3abb3", fontFamily: "Helvetica-Oblique" },

  numeroPagina: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7, color: "#9aa3ad", textAlign: "center" },
});

const dataBR = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR");

function Bloco({
  nome,
  dica,
  cor,
  itens,
  vazio,
  meta,
}: {
  nome: string;
  dica: string;
  cor: string;
  itens: Activity[];
  vazio: string;
  meta: (a: Activity) => string;
}) {
  return (
    <View style={s.bloco}>
      <View style={s.blocoTopo} wrap={false}>
        <View style={[s.blocoMarca, { backgroundColor: cor }]} />
        <View>
          <Text style={s.blocoNome}>{nome}</Text>
          <Text style={s.blocoDica}>{dica}</Text>
        </View>
        <Text style={s.contador}>{itens.length}</Text>
      </View>
      <View style={s.lista}>
        {itens.length === 0 && <Text style={s.vazio}>{vazio}</Text>}
        {itens.map((a, i) => (
          <View key={a.id} style={[s.item, i === itens.length - 1 ? s.itemUltimo : {}]} wrap={false}>
            <View style={s.ponto} />
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.itemTitulo}>{a.title}</Text>
              {a.description?.trim() ? <Text style={s.itemDesc}>{a.description.trim()}</Text> : null}
            </View>
            <Text style={s.itemMeta}>{meta(a)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MonthlyReportDocument({
  clientName,
  referenceMonth,
  referenceYear,
  periodo,
  concluidas,
  emAndamento,
  aFazer,
}: {
  clientName: string;
  referenceMonth: number;
  referenceYear: number;
  /** relatório de outro período (ex.: semana): substitui "Mês de Ano" e "no mês" */
  periodo?: { rotulo: string; sufixo: string };
  concluidas: Activity[];
  emAndamento: Activity[];
  aFazer: Activity[];
}) {
  const referencia = periodo?.rotulo ?? `${MESES[referenceMonth]} de ${referenceYear}`;
  const noPeriodo = periodo?.sufixo ?? "no mês";

  return (
    <Document title={`Relatório — ${clientName} — ${referencia}`} author="MC Advogados">
      <Page size="A4" style={s.page} wrap>
        <View style={s.capa} wrap={false}>
          <View style={s.capaTopo}>
            <View style={s.marcaLinha}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não aceita alt */}
              <Image src={ONBOARDING_MARK_PNG} style={s.marca} />
              <View>
                <Text style={s.marcaNome}>{MC_LETTERHEAD.nome}</Text>
                <Text style={s.marcaSub}>{MC_LETTERHEAD.subtitulo}</Text>
                <Text style={s.marcaGuia}>RELATÓRIO MENSAL DA ASSESSORIA</Text>
              </View>
            </View>
            <View style={s.contato}>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.telefone}</Text>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.email}</Text>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.endereco}</Text>
              <Text style={s.contatoTxt}>{MC_LETTERHEAD.oab}</Text>
            </View>
          </View>

          <View style={s.painel}>
            <Text style={s.selo}>{referencia.toUpperCase()}</Text>
            <Text style={s.titulo}>Relatório de atividades</Text>
            <Text style={s.rotulo}>CLIENTE</Text>
            <Text style={s.cliente}>{clientName}</Text>
            <View style={s.numeros}>
              <View style={s.numero}>
                <Text style={s.numeroValor}>{concluidas.length}</Text>
                <Text style={s.numeroRotulo}>CONCLUÍDAS {noPeriodo.toUpperCase()}</Text>
              </View>
              <View style={s.numero}>
                <Text style={s.numeroValor}>{emAndamento.length}</Text>
                <Text style={s.numeroRotulo}>EM ANDAMENTO</Text>
              </View>
              <View style={[s.numero, { marginRight: 0 }]}>
                <Text style={s.numeroValor}>{aFazer.length}</Text>
                <Text style={s.numeroRotulo}>A FAZER</Text>
              </View>
            </View>
          </View>
        </View>

        <Bloco
          nome={`Concluídas ${noPeriodo}`}
          dica="O que foi feito"
          cor="#2f8f5b"
          itens={concluidas}
          vazio={`Nenhuma atividade concluída ${noPeriodo === "no mês" ? "neste mês" : noPeriodo}.`}
          meta={(a) => `${ACTIVITY_TYPE_LABEL[a.type]} · ${dataBR(a.updated_at)}`}
        />
        <Bloco
          nome="Em andamento"
          dica="O que estamos fazendo"
          cor={GOLD}
          itens={emAndamento}
          vazio="Nenhuma atividade em andamento."
          meta={(a) => (a.deadline ? `Prazo ${dataBR(a.deadline)}` : ACTIVITY_TYPE_LABEL[a.type])}
        />
        <Bloco
          nome="A fazer"
          dica="O que vem pela frente"
          cor={NAVY2}
          itens={aFazer}
          vazio="Nenhuma atividade pendente."
          meta={(a) => (a.deadline ? `Prazo ${dataBR(a.deadline)}` : ACTIVITY_TYPE_LABEL[a.type])}
        />

        <Text
          style={s.numeroPagina}
          render={({ pageNumber, totalPages }) => `MC Advogados · ${clientName} · ${referencia} · página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

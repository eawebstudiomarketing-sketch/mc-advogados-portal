import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { MC_LETTERHEAD } from "@/lib/onboarding-schema";
import type { Bloco } from "@/lib/transcricao-formato";
import { ONBOARDING_MARK_PNG } from "./onboarding-mark";

// PDF da transcrição no padrão do escritório: faixa navy com o timbre, título
// e dados da gravação; depois Resumo e/ou Transcrição. Helvetica (sem emoji).

const NAVY = "#091827";
const NAVY2 = "#11273b";
const GOLD = "#c6a24f";
const GOLD2 = "#e1cd93";
const GOLD_TXT = "#8a6c2c";
const INK = "#1b2732";
const MUTED = "#66727d";

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 46, paddingHorizontal: 40, fontSize: 10.5, fontFamily: "Helvetica", color: INK, backgroundColor: "#ffffff" },
  faixa: { backgroundColor: NAVY2, borderRadius: 12, padding: 18, marginBottom: 18 },
  topo: { flexDirection: "row", alignItems: "center" },
  marca: { width: 34, height: 34, borderRadius: 17, marginRight: 10 },
  marcaNome: { fontSize: 7.5, color: GOLD2, letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  marcaSub: { fontSize: 12, color: "#ffffff", letterSpacing: 1.5, fontFamily: "Helvetica-Bold", marginTop: 1 },
  selo: { marginLeft: "auto", border: `0.6pt solid ${GOLD}`, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 9, fontSize: 6.5, color: GOLD2, letterSpacing: 1.5, fontFamily: "Helvetica-Bold" },
  titulo: { marginTop: 14, fontSize: 17, color: "#ffffff", fontFamily: "Helvetica-Bold", lineHeight: 1.25 },
  meta: { marginTop: 5, fontSize: 8, color: "#a9b4c0", lineHeight: 1.4 },
  secao: { marginTop: 14, marginBottom: 8, paddingBottom: 4, borderBottom: `1pt solid ${GOLD}`, fontSize: 13, color: NAVY, fontFamily: "Helvetica-Bold" },
  subsecao: { marginTop: 10, marginBottom: 4, fontSize: 8.5, color: GOLD_TXT, letterSpacing: 1.3, fontFamily: "Helvetica-Bold" },
  paragrafo: { marginBottom: 7, fontSize: 10.5, lineHeight: 1.55, color: INK },
  item: { marginBottom: 3, paddingLeft: 4, fontSize: 10.5, lineHeight: 1.5, color: INK },
  rodape: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
});

export function TranscricaoPdf({ blocos }: { blocos: Bloco[] }) {
  const titulo = blocos.find((b) => b.tipo === "titulo")?.texto ?? "Transcrição";
  const meta = blocos.find((b) => b.tipo === "meta")?.texto ?? "";
  const corpo = blocos.filter((b) => b.tipo !== "titulo" && b.tipo !== "meta");
  return (
    <Document title={titulo} author="MC Advogados" creator="Portal MC Advogados">
      <Page size="A4" style={s.page} wrap>
        <View style={s.faixa}>
          <View style={s.topo}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
            <Image src={ONBOARDING_MARK_PNG} style={s.marca} />
            <View>
              <Text style={s.marcaNome}>{MC_LETTERHEAD.nome}</Text>
              <Text style={s.marcaSub}>{MC_LETTERHEAD.subtitulo}</Text>
            </View>
            <Text style={s.selo}>TRANSCRIÇÃO DE ÁUDIO</Text>
          </View>
          <Text style={s.titulo}>{titulo}</Text>
          {meta ? <Text style={s.meta}>{meta}</Text> : null}
        </View>
        {corpo.map((b, i) => (
          <Text key={i} style={b.tipo === "paragrafo" && /^[•\-–]/.test(b.texto) ? s.item : s[b.tipo as "secao" | "subsecao" | "paragrafo"]} minPresenceAhead={b.tipo === "paragrafo" ? 0 : 40}>
            {b.texto}
          </Text>
        ))}
        <View style={s.rodape} fixed>
          <Text>
            {MC_LETTERHEAD.nome} {MC_LETTERHEAD.subtitulo} · {MC_LETTERHEAD.oab} · {MC_LETTERHEAD.telefone}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

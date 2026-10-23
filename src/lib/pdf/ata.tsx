import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { MC_LETTERHEAD } from "@/lib/onboarding-schema";
import { identificacao, NOTA_INTERNA, type BlocoAta, type DadosAta } from "@/lib/atas/formato";

// PDF da ata no visual do modelo do escritório ("Ata de Onboarding - HOUSE
// BURGUER", set/2026): página branca, "MC ADVOGADOS" no topo, título grande,
// seções numeradas com linha fina, rótulos em negrito e itens com marcador.
// Na versão assinada, a última página é o registro das assinaturas.

const INK = "#1b1f24";
const MUTED = "#6b7280";
const LINE = "#d6d9de";

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 54, paddingHorizontal: 54, fontSize: 10, fontFamily: "Helvetica", color: INK, lineHeight: 1.45 },
  marca: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  titulo: { marginTop: 10, fontSize: 19, fontFamily: "Helvetica-Bold" },
  regua: { marginTop: 14, marginBottom: 6, borderBottom: `1pt solid ${INK}` },
  secao: { marginTop: 16, marginBottom: 7, paddingBottom: 4, borderBottom: `0.6pt solid ${LINE}`, fontSize: 11, fontFamily: "Helvetica-Bold" },
  subsecao: { marginTop: 7, marginBottom: 3, fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  linha: { marginBottom: 2 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  itemLinha: { flexDirection: "row", marginBottom: 4, paddingLeft: 6 },
  bolinha: { width: 12 },
  itemTexto: { flex: 1 },
  numerado: { marginTop: 7, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  campo: { marginBottom: 2, paddingLeft: 14 },
  campoPrioridade: { marginBottom: 2, paddingLeft: 14, fontSize: 8.5, color: MUTED },
  paragrafo: { marginBottom: 5 },
  nota: { marginBottom: 6, fontSize: 8.5, color: MUTED, fontFamily: "Helvetica-Oblique" },
  rodape: { position: "absolute", bottom: 24, left: 54, right: 54, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
  // registro de assinaturas
  regTitulo: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  regInfo: { marginTop: 8, fontSize: 9, color: MUTED },
  regHash: { marginTop: 2, fontSize: 8, fontFamily: "Courier", color: INK },
  regCaixa: { marginTop: 12, padding: 10, border: `0.6pt solid ${LINE}`, borderRadius: 6 },
  regNome: { fontSize: 10.5, fontFamily: "Helvetica-Bold" },
  regLinha: { marginTop: 2, fontSize: 8.5, color: MUTED },
  regLegal: { marginTop: 16, fontSize: 8.5, color: MUTED, lineHeight: 1.5 },
});

export type RegistroAssinatura = { nome: string; papel: string; quando: string; via: string; ip: string | null; aparelho: string | null };
export type Registro = { documento: string; hash: string; assinaturas: RegistroAssinatura[] };

function Bloco({ b }: { b: BlocoAta }) {
  if (b.tipo === "secao")
    return (
      <View minPresenceAhead={50}>
        <Text style={s.secao}>
          {b.numero}. {b.texto}
        </Text>
        {b.interna ? <Text style={s.nota}>{NOTA_INTERNA}</Text> : null}
      </View>
    );
  if (b.tipo === "subsecao")
    return (
      <Text style={s.subsecao} minPresenceAhead={30}>
        {b.texto}
      </Text>
    );
  if (b.tipo === "item")
    return (
      <View style={s.itemLinha} wrap={false}>
        <Text style={s.bolinha}>•</Text>
        <Text style={s.itemTexto}>{b.texto}</Text>
      </View>
    );
  if (b.tipo === "numerado")
    return (
      <Text style={s.numerado} minPresenceAhead={30}>
        {b.texto}
      </Text>
    );
  if (b.tipo === "campo")
    return (
      <Text style={/^prioridade$/i.test(b.rotulo) ? s.campoPrioridade : s.campo}>
        {/^prioridade$/i.test(b.rotulo) ? `${b.rotulo}: ${b.texto}` : <><Text style={s.rotulo}>{b.rotulo}: </Text>{b.texto}</>}
      </Text>
    );
  return <Text style={s.paragrafo}>{b.texto}</Text>;
}

export function AtaPdf({ dados, blocos, registro }: { dados: DadosAta; blocos: BlocoAta[]; registro?: Registro | null }) {
  const rodape = (
    <View style={s.rodape} fixed>
      <Text>
        {MC_LETTERHEAD.nome} {MC_LETTERHEAD.subtitulo} · {MC_LETTERHEAD.oab}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
  return (
    <Document title={`${dados.titulo}${dados.cliente ? ` — ${dados.cliente}` : ""}`} author="MC Advogados" creator="Portal MC Advogados">
      <Page size="A4" style={s.page} wrap>
        <Text style={s.marca}>MC ADVOGADOS</Text>
        <Text style={s.titulo}>{dados.titulo}</Text>
        <View style={s.regua} />
        <Text style={s.secao}>1. Identificação da reunião</Text>
        {identificacao(dados).map((l) => (
          <Text key={l.rotulo} style={s.linha}>
            <Text style={s.rotulo}>{l.rotulo}: </Text>
            {l.texto}
          </Text>
        ))}
        {blocos.map((b, i) => (
          <Bloco key={i} b={b} />
        ))}
        {rodape}
      </Page>
      {registro ? (
        <Page size="A4" style={s.page}>
          <Text style={s.marca}>MC ADVOGADOS</Text>
          <Text style={[s.titulo, { fontSize: 16 }]}>Registro de assinaturas</Text>
          <View style={s.regua} />
          <Text style={s.regInfo}>Documento: {registro.documento}</Text>
          <Text style={s.regInfo}>Impressão digital do documento assinado (SHA-256):</Text>
          <Text style={s.regHash}>{registro.hash}</Text>
          {registro.assinaturas.map((a, i) => (
            <View key={i} style={s.regCaixa} wrap={false}>
              <Text style={s.regNome}>{a.nome}</Text>
              <Text style={s.regLinha}>{a.papel} · assinado em {a.quando}</Text>
              <Text style={s.regLinha}>{a.via}</Text>
              {a.ip || a.aparelho ? <Text style={s.regLinha}>{[a.ip ? `IP ${a.ip}` : "", a.aparelho ?? ""].filter(Boolean).join(" · ")}</Text> : null}
            </View>
          ))}
          <Text style={s.regLegal}>
            Assinatura eletrônica realizada pelo Portal MC Advogados, com link pessoal e confirmação por código enviado ao telefone ou e-mail de cada signatário, admitida
            pelas partes como válida nos termos do art. 10, § 2º, da MP nº 2.200-2/2001. A impressão digital acima identifica o conteúdo exato que foi assinado: qualquer
            alteração no documento produz outra impressão digital.
          </Text>
          {rodape}
        </Page>
      ) : null}
    </Document>
  );
}

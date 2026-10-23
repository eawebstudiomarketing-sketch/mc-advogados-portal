import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { MC_LETTERHEAD } from "@/lib/onboarding-schema";
import { identificacao, NOTA_INTERNA, type BlocoAta, type DadosAta } from "@/lib/atas/formato";

// PDF da ata no visual do modelo do escritório ("Ata de Onboarding - HOUSE
// BURGUER", set/2026): página branca, "MC ADVOGADOS" no topo, título grande,
// seções numeradas com linha fina, rótulos em negrito e itens com marcador.
// No fim, o bloco de assinaturas (com a assinatura desenhada de cada um na
// versão assinada) e, nela, as rubricas no rodapé e o registro das
// assinaturas na última página. O código de validação vai no rodapé.

const INK = "#1b1f24";
const MUTED = "#6b7280";
const LINE = "#d6d9de";

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 62, paddingHorizontal: 54, fontSize: 10, fontFamily: "Helvetica", color: INK },
  marca: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  titulo: { marginTop: 10, fontSize: 19, fontFamily: "Helvetica-Bold" },
  regua: { marginTop: 14, marginBottom: 6, borderBottom: `1pt solid ${INK}` },
  secao: { marginTop: 16, marginBottom: 7, paddingBottom: 4, borderBottom: `0.6pt solid ${LINE}`, fontSize: 11, fontFamily: "Helvetica-Bold" },
  subsecao: { marginTop: 7, marginBottom: 3, fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  // espaçamento de linha só nos textos (na página inteira some o rodapé fixo — bug do react-pdf)
  linha: { marginBottom: 2, fontSize: 10, lineHeight: 1.45 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  itemLinha: { flexDirection: "row", marginBottom: 4, paddingLeft: 6 },
  bolinha: { width: 12 },
  itemTexto: { flex: 1, fontSize: 10, lineHeight: 1.45 },
  numerado: { marginTop: 7, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  campo: { marginBottom: 2, paddingLeft: 14, fontSize: 10, lineHeight: 1.45 },
  campoPrioridade: { marginBottom: 2, paddingLeft: 14, fontSize: 8.5, color: MUTED },
  paragrafo: { marginBottom: 5, fontSize: 10, lineHeight: 1.45 },
  nota: { marginBottom: 6, fontSize: 8.5, color: MUTED, fontFamily: "Helvetica-Oblique" },
  // bloco de assinaturas
  assinaturas: { marginTop: 8, flexDirection: "row", flexWrap: "wrap" },
  assinante: { width: "50%", paddingRight: 18, marginTop: 14 },
  assinaturaImg: { height: 38, objectFit: "contain", objectPosition: "left bottom" },
  assinaturaVazia: { height: 38 },
  assinaturaLinha: { borderTop: `0.8pt solid ${INK}`, paddingTop: 3 },
  assinanteNome: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  assinanteInfo: { fontSize: 8, color: MUTED },
  // rodapé
  rodapeLinha: { position: "absolute", bottom: 20, left: 54, right: 54, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
  rubricas: { position: "absolute", bottom: 34, left: 54, right: 54, flexDirection: "row", justifyContent: "flex-end" },
  rubrica: { height: 14, width: 42, objectFit: "contain", marginLeft: 6 },
  // registro de assinaturas
  regInfo: { marginTop: 8, fontSize: 9, color: MUTED },
  regHash: { marginTop: 2, fontSize: 8, fontFamily: "Courier", color: INK },
  regCaixa: { marginTop: 12, padding: 10, border: `0.6pt solid ${LINE}`, borderRadius: 6, flexDirection: "row" },
  regTexto: { flex: 1 },
  regImg: { width: 110, height: 40, objectFit: "contain", marginLeft: 10 },
  regNome: { fontSize: 10.5, fontFamily: "Helvetica-Bold" },
  regLinha: { marginTop: 2, fontSize: 8.5, color: MUTED, lineHeight: 1.4 },
  regLegal: { marginTop: 16, fontSize: 8.5, color: MUTED, lineHeight: 1.5 },
});

export type AssinanteNoPdf = { nome: string; papel: string; img?: Buffer | null; quando?: string | null };
export type RegistroAssinatura = {
  nome: string;
  papel: string;
  quando: string;
  via: string;
  ip: string | null;
  aparelho: string | null;
  cpf?: string | null;
  local?: string | null;
  extras?: string[];
  img?: Buffer | null;
};
export type Registro = {
  documento: string;
  hash: string;
  assinaturas: RegistroAssinatura[];
  /** carimbo do tempo RFC 3161 do conteúdo assinado */
  carimbo?: { quando: string; tsa: string; serie: string } | null;
  /** titular do certificado do escritório que sela o PDF (PAdES) */
  selo?: string | null;
};

const png = (b: Buffer) => ({ data: b, format: "png" as const });

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

export function AtaPdf({
  dados,
  blocos,
  registro,
  assinantes,
  rubricas,
  codigo,
}: {
  dados: DadosAta;
  blocos: BlocoAta[];
  registro?: Registro | null;
  assinantes?: AssinanteNoPdf[];
  rubricas?: Buffer[];
  codigo?: string | null;
}) {
  const ultimaSecao = blocos.filter((b) => b.tipo === "secao").reduce((n, b) => Math.max(n, b.tipo === "secao" ? b.numero : n), 1);
  const rodape = (comRubricas: boolean) => [
    comRubricas && rubricas?.length ? (
      <View key="rubricas" style={s.rubricas} fixed>
        {rubricas.map((r, i) => (
          // eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt
          <Image key={i} src={png(r)} style={s.rubrica} />
        ))}
      </View>
    ) : null,
    <View key="rodape" style={s.rodapeLinha} fixed>
      <Text>{`${MC_LETTERHEAD.nome} ${MC_LETTERHEAD.subtitulo} · ${MC_LETTERHEAD.oab}${codigo ? `  ·  Código de validação ${codigo} — mcadvogados.app.br/validar` : ""}`}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>,
  ];
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
        {assinantes?.length ? (
          <View wrap={false}>
            <Text style={s.secao}>{ultimaSecao + 1}. Assinaturas</Text>
            <View style={s.assinaturas}>
              {assinantes.map((a, i) => (
                <View key={i} style={s.assinante}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
                  {a.img ? <Image src={png(a.img)} style={s.assinaturaImg} /> : <View style={s.assinaturaVazia} />}
                  <View style={s.assinaturaLinha}>
                    <Text style={s.assinanteNome}>{a.nome}</Text>
                    <Text style={s.assinanteInfo}>
                      {a.papel}
                      {a.quando ? ` · assinado em ${a.quando}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {rodape(true)}
      </Page>
      {registro ? (
        <Page size="A4" style={s.page}>
          <Text style={s.marca}>MC ADVOGADOS</Text>
          <Text style={[s.titulo, { fontSize: 16 }]}>Registro de assinaturas</Text>
          <View style={s.regua} />
          <Text style={s.regInfo}>Documento: {registro.documento}</Text>
          {codigo ? <Text style={s.regInfo}>Código de validação: {codigo} (confira em mcadvogados.app.br/validar)</Text> : null}
          <Text style={s.regInfo}>Impressão digital do documento assinado (SHA-256):</Text>
          <Text style={s.regHash}>{registro.hash}</Text>
          {registro.carimbo ? (
            <Text style={s.regInfo}>
              Carimbo do tempo: {registro.carimbo.quando} — {registro.carimbo.tsa} (RFC 3161), série {registro.carimbo.serie}. Prova, por uma autoridade independente, que o conteúdo com a impressão digital acima
              existia nesse instante.
            </Text>
          ) : null}
          {registro.selo ? <Text style={s.regInfo}>PDF selado digitalmente (PAdES) com o certificado de {registro.selo}: qualquer alteração no arquivo invalida o selo.</Text> : null}
          {registro.assinaturas.map((a, i) => (
            <View key={i} style={s.regCaixa} wrap={false}>
              <View style={s.regTexto}>
                <Text style={s.regNome}>{a.nome}</Text>
                <Text style={s.regLinha}>
                  {a.papel}
                  {a.cpf ? ` · CPF ${a.cpf}` : ""} · assinado em {a.quando}
                </Text>
                <Text style={s.regLinha}>{a.via}</Text>
                {(a.extras ?? []).map((x, j) => (
                  <Text key={j} style={s.regLinha}>
                    {x}
                  </Text>
                ))}
                {a.local ? <Text style={s.regLinha}>Local: {a.local}</Text> : null}
                {a.ip || a.aparelho ? <Text style={s.regLinha}>{[a.ip ? `IP ${a.ip}` : "", a.aparelho ?? ""].filter(Boolean).join(" · ")}</Text> : null}
              </View>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
              {a.img ? <Image src={png(a.img)} style={s.regImg} /> : null}
            </View>
          ))}
          <Text style={s.regLegal}>
            Assinatura eletrônica realizada pelo Portal MC Advogados, com link pessoal e confirmação por código enviado ao telefone ou e-mail de cada signatário, admitida
            pelas partes como válida nos termos do art. 10, § 2º, da MP nº 2.200-2/2001. Quando indicado, a assinatura também foi feita com certificado digital ICP-Brasil
            (assinatura destacada em arquivo .p7s, verificável em validar.iti.gov.br). A impressão digital acima identifica o conteúdo exato que foi assinado: qualquer
            alteração no documento produz outra impressão digital.
          </Text>
          {rodape(false)}
        </Page>
      ) : null}
    </Document>
  );
}

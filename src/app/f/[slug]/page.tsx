import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Lato, Playfair_Display } from "next/font/google";
import { formularioPorSlug, pixelsPublicos } from "@/lib/crm/dados";
import { FormularioPublico } from "./formulario-publico";
import { IscaRiscos } from "@/app/ferramentas/riscos-trabalhistas/isca-riscos";

// Formulário público do CRM (06/11/2026): mcadvogados.app.br/f/<slug>.
// Mesmo desenho do Yay! Forms que o escritório usava (uma pergunta por tela).

const lato = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-lato" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "800"], style: ["normal", "italic"], variable: "--font-playfair" });

// 19/11/2026 (pedido do Maurício): o quiz antigo de riscos jurídicos virou o diagnóstico novo das
// iscas (uma pergunta por tela, medidor, plano liberado com nome e WhatsApp), com a foto da equipe.
// O link é o mesmo e o lead continua caindo no formulário riscos-juridicos.
const DIAGNOSTICO_NOVO = new Set(["riscos-juridicos"]);

export const revalidate = 300;

const limpo = (html: string | undefined) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const form = await formularioPorSlug((await params).slug);
  if (!form) return { title: "Formulário" };
  const titulo = limpo(form.config.boasVindas.titulo) || form.nome;
  const desc = limpo(form.config.boasVindas.descricao).slice(0, 160);
  const img = form.config.boasVindas.imagem;
  return {
    title: `${titulo} · MC Advogados`,
    description: desc,
    robots: { index: false },
    openGraph: { title: titulo, description: desc, ...(img ? { images: [img] } : {}) },
  };
}

export const viewport: Viewport = { themeColor: "#000000" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [form, pixels] = await Promise.all([formularioPorSlug(slug), pixelsPublicos()]);
  if (!form || !form.ativo) notFound();
  if (DIAGNOSTICO_NOVO.has(form.slug))
    return (
      <div className={`${lato.variable} ${playfair.variable}`}>
        <IscaRiscos slug={form.slug} foto="/brand/equipe-mc.webp" />
      </div>
    );
  return (
    <div className={lato.variable}>
      <FormularioPublico slug={form.slug} config={form.config} pixels={pixels} />
    </div>
  );
}

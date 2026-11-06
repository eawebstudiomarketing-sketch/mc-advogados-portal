import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Lato } from "next/font/google";
import { formularioPorSlug, pixelsPublicos } from "@/lib/crm/dados";
import { FormularioPublico } from "./formulario-publico";

// Formulário público do CRM (06/11/2026): mcadvogados.app.br/f/<slug>.
// Mesmo desenho do Yay! Forms que o escritório usava (uma pergunta por tela).

const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato" });

export const dynamic = "force-dynamic";

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
  return (
    <div className={lato.variable}>
      <FormularioPublico slug={form.slug} config={form.config} pixels={pixels} />
    </div>
  );
}

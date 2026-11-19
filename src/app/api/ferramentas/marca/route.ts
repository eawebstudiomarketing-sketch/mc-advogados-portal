import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { previaMarca, PREVIAS_POR_DIA } from "@/lib/iscas/marca";
import { ramoDoTexto, ramoPorId } from "@/lib/iscas/ramos";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";

// Isca pública (18/11/2026): prévia de "Sua marca pode ser registrada?". Sem login.
// { marca, ramo (digitado) } → risco indicativo + dados da prévia do relatório. Limite por IP/dia.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { marca?: unknown; ramo?: unknown; site?: unknown } | null;
  const marca = typeof corpo?.marca === "string" ? corpo.marca.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const ramoTxt = typeof corpo?.ramo === "string" ? corpo.ramo.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (corpo?.site) return NextResponse.json({ erro: "Tente de novo." }, { status: 400 }); // robô
  if (marca.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return NextResponse.json({ erro: "Digite o nome da marca." }, { status: 400 });
  if (ramoTxt.length < 3) return NextResponse.json({ erro: "Conte qual é o ramo do seu negócio." }, { status: 400 });

  // limite por IP e por dia (guardado no painel_gerente, como as travas do portal)
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "sem-ip";
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const chave = `isca:marca:${dia}:${ip}`;
  const db = createAdminClient() as unknown as SupabaseClient;
  const { data: uso } = await db.from("painel_gerente").select("conteudo").eq("chave", chave).maybeSingle();
  const n = Number((uso?.conteudo as { n?: number } | null)?.n ?? 0);
  if (n >= PREVIAS_POR_DIA)
    return NextResponse.json({ erro: "Você já fez várias consultas hoje. Fale com um especialista que ele faz a análise completa para você." }, { status: 429 });
  await db.from("painel_gerente").upsert({ chave, conteudo: { n: n + 1 }, created_at: new Date().toISOString() }, { onConflict: "chave" });
  // de vez em quando apaga as contagens de dias passados
  if (Math.random() < 0.05) await db.from("painel_gerente").delete().like("chave", "isca:%").lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString());

  try {
    const classes = await classesDoRamo(ramoTxt);
    const previa = await previaMarca(marca, classes);
    return NextResponse.json({ ok: true, marca, ramo: ramoTxt, ...previa });
  } catch (e) {
    console.error("isca marca:", e);
    return NextResponse.json({ erro: "A consulta está lenta agora. Tente de novo em instantes." }, { status: 503 });
  }
}

/** Ramo digitado → classes NCL. Palavra-chave primeiro (sem custo); só o resto vai para a IA mais barata. */
async function classesDoRamo(texto: string): Promise<string[]> {
  const r = ramoDoTexto(texto) ?? ramoPorId(texto);
  if (r) return r.classes;
  const ia = await generateJson<{ classes: string[] }>({
    system: "Você classifica negócios na Classificação de Nice (NCL 12). Responda as 1 ou 2 classes NCL mais importantes para registrar a marca do negócio descrito, só os números.",
    parts: [{ text: `Negócio: ${texto}` }],
    model: MODELOS.leitura,
    funcao: "isca_marca",
    schema: { type: "object", properties: { classes: { type: "array", items: { type: "string" } } }, required: ["classes"] },
  }).catch(() => null);
  const cls = ia?.ok ? [...new Set(ia.data.classes.map((c) => String(Number(String(c).replace(/\D/g, "")))).filter((c) => Number(c) >= 1 && Number(c) <= 45))].slice(0, 2) : [];
  return cls.length ? cls : ["35"];
}

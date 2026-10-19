import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { categoriaDoItem } from "@/lib/pedidos-documentos";

// Pedido aberto pelo cliente no portal dele. Vira atividade do cliente (o
// gatilho do banco põe na Distribuição); urgência vai como prioridade da
// Distribuição e o anexo entra nos documentos do cliente.
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // limite de envio da Vercel
const sanitizar = (nome: string) => nome.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br").replace(/\/$/, "");
const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function POST(request: Request) {
  const profile = await requireRole(["client"]);
  const clientId = profile.client_id!;
  const form = await request.formData();
  const titulo = String(form.get("titulo") ?? "").trim().slice(0, 140);
  const descricao = String(form.get("descricao") ?? "").trim().slice(0, 4000);
  const urgente = form.get("urgencia") === "urgente";
  const prazoTxt = String(form.get("prazo") ?? "").trim();
  const prazo = /^\d{4}-\d{2}-\d{2}$/.test(prazoTxt) ? prazoTxt : null;
  const arquivo = form.get("arquivo");

  if (!titulo) return NextResponse.json({ error: "Conte em poucas palavras do que você precisa." }, { status: 400 });
  const temArquivo = arquivo instanceof File && arquivo.size > 0;
  if (temArquivo && arquivo.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo grande demais (máx. 4 MB). Se precisar, mande por e-mail ao escritório." }, { status: 413 });
  }

  const db = createAdminClient();

  // anexo primeiro: se falhar, o pedido nem é criado
  let docId: string | null = null;
  let filePath: string | null = null;
  if (temArquivo) {
    filePath = `${clientId}/cliente-${Date.now()}-${sanitizar(arquivo.name)}`;
    const { error: upErr } = await db.storage.from("documents").upload(filePath, arquivo, { contentType: arquivo.type || undefined });
    if (upErr) return NextResponse.json({ error: "Não foi possível enviar o anexo. Tente novamente." }, { status: 500 });
    const { data: doc, error: docErr } = await db
      .from("documents")
      .insert({
        client_id: clientId,
        uploaded_by: profile.id,
        category: categoriaDoItem(null),
        title: `Anexo do pedido: ${titulo}`,
        file_path: filePath,
      })
      .select("id")
      .single();
    if (docErr || !doc) {
      await db.storage.from("documents").remove([filePath]);
      return NextResponse.json({ error: "Não foi possível registrar o anexo. Tente novamente." }, { status: 500 });
    }
    docId = doc.id;
  }

  const descricaoFinal = [descricao, temArquivo ? `Anexo: ${arquivo.name} (nos documentos do cliente)` : ""].filter(Boolean).join("\n\n") || null;
  const supabase = await createClient();
  const { data: atividade, error } = await supabase
    .from("activities")
    .insert({
      client_id: clientId,
      responsible_id: profile.id,
      title: titulo,
      description: descricaoFinal,
      type: "consultoria", // a equipe reclassifica ao distribuir
      deadline: prazo,
    })
    .select("id")
    .single();

  if (error || !atividade) {
    if (docId) await db.from("documents").delete().eq("id", docId);
    if (filePath) await db.storage.from("documents").remove([filePath]);
    return NextResponse.json({ error: "Não foi possível enviar o pedido. Tente novamente." }, { status: 500 });
  }

  // a linha da Distribuição foi criada pelo gatilho; aqui só a urgência
  if (urgente) await db.from("distribuicao").update({ prioridade: "alta" }).eq("activity_id", atividade.id);

  // aviso à equipe (admins) — não bloqueia o pedido se falhar
  try {
    const resend = getResendClient();
    const [{ data: admins }, { data: cliente }] = await Promise.all([
      db.from("profiles").select("email").eq("role", "admin").eq("oculto", false).eq("ativo", true),
      db.from("clients").select("name").eq("id", clientId).maybeSingle(),
    ]);
    const para = (admins ?? []).map((a) => a.email).filter(Boolean);
    if (resend && para.length) {
      const nome = escapar(cliente?.name ?? "Um cliente");
      await resend.client.emails.send({
        from: resend.from,
        to: para,
        subject: `${urgente ? "[URGENTE] " : ""}Pedido de ${cliente?.name ?? "cliente"}: ${titulo}`,
        html: `<p><strong>${nome}</strong> fez um pedido pelo portal${urgente ? " e marcou como <strong>urgente</strong>" : ""}:</p><p><strong>${escapar(titulo)}</strong></p>${descricao ? `<p>${escapar(descricao).replace(/\n/g, "<br>")}</p>` : ""}${temArquivo ? "<p>Com anexo (nos documentos do cliente).</p>" : ""}<p><a href="${site()}/admin/distribuicao">Abrir a Distribuição</a></p>`,
      });
    }
  } catch (e) {
    console.error("Aviso de pedido do cliente falhou", e);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pedidos");
  revalidatePath("/admin/distribuicao");
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { categoriaDoItem } from "@/lib/pedidos-documentos";

// Pedido aberto pelo cliente no portal dele. Vira atividade do cliente (o
// gatilho do banco põe na Distribuição); urgência vai como prioridade da
// Distribuição; anexo e áudio (pedido falado) entram nos documentos do cliente.
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
  const horaTxt = String(form.get("hora") ?? "").trim();
  const hora = prazo && /^\d{2}:\d{2}$/.test(horaTxt) ? horaTxt : null;
  const arquivo = form.get("arquivo");
  const audio = form.get("audio");

  if (!titulo) return NextResponse.json({ error: "Conte em poucas palavras do que você precisa." }, { status: 400 });
  const temArquivo = arquivo instanceof File && arquivo.size > 0;
  const temAudio = audio instanceof File && audio.size > 0 && (audio.type || "audio/").startsWith("audio/");
  if ((temArquivo ? arquivo.size : 0) + (temAudio ? audio.size : 0) > MAX_BYTES) {
    return NextResponse.json({ error: "Anexo e áudio juntos passam de 4 MB. Tire o anexo e mande por e-mail ao escritório." }, { status: 413 });
  }

  const db = createAdminClient();

  // anexo e áudio primeiro: se falharem, o pedido nem é criado
  const guardados: { docId: string; filePath: string }[] = [];
  const desfazer = async () => {
    if (guardados.length) {
      await db.from("documents").delete().in("id", guardados.map((g) => g.docId));
      await db.storage.from("documents").remove(guardados.map((g) => g.filePath));
    }
  };
  const envios = [
    temArquivo ? { file: arquivo, titulo: `Anexo do pedido: ${titulo}` } : null,
    temAudio ? { file: audio, titulo: `Áudio do pedido: ${titulo}` } : null,
  ].filter((x): x is { file: File; titulo: string } => !!x);
  for (const e of envios) {
    const filePath = `${clientId}/cliente-${Date.now()}-${sanitizar(e.file.name)}`;
    const { error: upErr } = await db.storage.from("documents").upload(filePath, e.file, { contentType: e.file.type || undefined });
    if (upErr) {
      await desfazer();
      return NextResponse.json({ error: "Não foi possível enviar o anexo. Tente novamente." }, { status: 500 });
    }
    const { data: doc, error: docErr } = await db
      .from("documents")
      .insert({ client_id: clientId, uploaded_by: profile.id, category: categoriaDoItem(null), title: e.titulo, file_path: filePath })
      .select("id")
      .single();
    if (docErr || !doc) {
      await db.storage.from("documents").remove([filePath]);
      await desfazer();
      return NextResponse.json({ error: "Não foi possível registrar o anexo. Tente novamente." }, { status: 500 });
    }
    guardados.push({ docId: doc.id, filePath });
  }

  const descricaoFinal =
    [
      descricao,
      temAudio ? "Pedido feito por áudio: o texto acima é a transcrição e o áudio original está nos documentos do cliente." : "",
      temArquivo ? `Anexo: ${arquivo.name} (nos documentos do cliente)` : "",
    ]
      .filter(Boolean)
      .join("\n\n") || null;
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
      hora,
    })
    .select("id")
    .single();

  if (error || !atividade) {
    await desfazer();
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
        html: `<p><strong>${nome}</strong> fez um pedido pelo portal${urgente ? " e marcou como <strong>urgente</strong>" : ""}:</p><p><strong>${escapar(titulo)}</strong></p>${descricao ? `<p>${escapar(descricao).replace(/\n/g, "<br>")}</p>` : ""}${temAudio ? "<p>Pedido feito por áudio (transcrito acima; o áudio está nos documentos do cliente).</p>" : ""}${temArquivo ? "<p>Com anexo (nos documentos do cliente).</p>" : ""}<p><a href="${site()}/admin/distribuicao">Abrir a Distribuição</a></p>`,
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

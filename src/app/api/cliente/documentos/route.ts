import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { categoriaDoItem, pedidosDoCliente } from "@/lib/pedidos-documentos";

// Envio de documento pelo próprio cliente no portal dele. O cliente não tem
// permissão de escrita no banco/Storage; este servidor confere quem é, grava
// com a credencial de serviço e sempre na pasta/cliente do próprio cliente.
// Avisa a equipe por e-mail (melhor esforço).
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // limite de envio da Vercel
const sanitizar = (nome: string) => nome.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br").replace(/\/$/, "");

export async function POST(request: Request) {
  const profile = await requireRole(["client"]);
  const clientId = profile.client_id!;
  const form = await request.formData();
  const file = form.get("file");
  const itemPedido = String(form.get("item") ?? "").trim() || null;
  const tituloLivre = String(form.get("titulo") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Selecione o arquivo." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máx. 4 MB). Se precisar, mande por e-mail ao escritório." }, { status: 413 });

  if (itemPedido) {
    const pedidos = await pedidosDoCliente(clientId);
    if (!pedidos.some((p) => p.item === itemPedido)) return NextResponse.json({ error: "Este documento não está na lista pedida." }, { status: 400 });
  }

  const db = createAdminClient();
  const titulo = itemPedido ?? (tituloLivre || file.name.replace(/\.[^.]+$/, ""));
  const filePath = `${clientId}/cliente-${Date.now()}-${sanitizar(file.name)}`;
  const { error: upErr } = await db.storage.from("documents").upload(filePath, file, { contentType: file.type || undefined });
  if (upErr) return NextResponse.json({ error: "Não foi possível enviar o arquivo. Tente novamente." }, { status: 500 });

  const { error: insErr } = await db.from("documents").insert({
    client_id: clientId,
    uploaded_by: profile.id,
    category: categoriaDoItem(itemPedido),
    title: titulo,
    file_path: filePath,
    requested_item: itemPedido,
  });
  if (insErr) {
    await db.storage.from("documents").remove([filePath]);
    return NextResponse.json({ error: "Não foi possível registrar o documento. Tente novamente." }, { status: 500 });
  }

  // aviso à equipe (admins) — não bloqueia o envio se falhar
  try {
    const resend = getResendClient();
    const [{ data: admins }, { data: cliente }] = await Promise.all([
      db.from("profiles").select("email").eq("role", "admin").eq("oculto", false).eq("ativo", true),
      db.from("clients").select("name").eq("id", clientId).maybeSingle(),
    ]);
    const para = (admins ?? []).map((a) => a.email).filter(Boolean);
    if (resend && para.length) {
      await resend.client.emails.send({
        from: resend.from,
        to: para,
        subject: `${cliente?.name ?? "Cliente"} enviou: ${titulo}`,
        html: `<p><strong>${cliente?.name ?? "Um cliente"}</strong> enviou <strong>${titulo}</strong> pelo portal${itemPedido ? " (documento pedido na ficha de handoff)" : ""}.</p><p><a href="${site()}/admin/clients/${clientId}?aba=documentos">Abrir os documentos do cliente</a></p>`,
      });
    }
  } catch (e) {
    console.error("Aviso de documento do cliente falhou", e);
  }

  revalidatePath("/dashboard/documentos");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/clients/${clientId}`);
  return NextResponse.json({ ok: true });
}

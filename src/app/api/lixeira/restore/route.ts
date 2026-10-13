import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/drive-api";
import { restoreBatch } from "@/lib/trash";

export const dynamic = "force-dynamic";

// Restaura um lote da lixeira (só admin). Se o lote veio de uma pasta
// desligada, a pasta é ligada de novo ao cliente.
export async function POST(request: Request) {
  const auth = await requireStaff(true);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { batchId?: string } | null;
  if (!body?.batchId || !/^[0-9a-f-]{36}$/i.test(body.batchId)) return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  try {
    const result = await restoreBatch(body.batchId);
    revalidatePath("/admin/lixeira");
    revalidatePath("/admin/documents");
    revalidatePath("/admin/integracoes/pastas");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível restaurar." }, { status: 500 });
  }
}

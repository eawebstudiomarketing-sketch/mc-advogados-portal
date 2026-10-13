import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { driveError, requireStaff } from "@/lib/drive-api";
import { syncClient, userCtx } from "@/lib/drive-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sincroniza UM cliente (as telas chamam uma vez por cliente, pra não estourar o
// tempo de uma única requisição).
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { clientId?: string } | null;
  if (!body?.clientId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  try {
    const result = await syncClient(await userCtx(auth.profile.id), body.clientId);
    revalidatePath("/admin/documents");
    revalidatePath(`/admin/clients/${body.clientId}`);
    revalidatePath("/admin/integracoes/pastas");
    return NextResponse.json(result);
  } catch (e) {
    return driveError(e, "sync");
  }
}

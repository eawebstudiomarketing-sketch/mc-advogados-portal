import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { driveError, requireStaff } from "@/lib/drive-api";
import { linkFolder, userCtx } from "@/lib/drive-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Liga uma pasta que já existia no Drive a um cliente e já sincroniza. SÓ ADMIN.
export async function POST(request: Request) {
  const auth = await requireStaff(true);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { clientId?: string; folderId?: string } | null;
  if (!body?.clientId || !body?.folderId) return NextResponse.json({ error: "Informe o cliente e a pasta." }, { status: 400 });
  try {
    const result = await linkFolder(await userCtx(auth.profile.id), body.clientId, body.folderId);
    revalidatePath("/admin/documents");
    revalidatePath(`/admin/clients/${body.clientId}`);
    revalidatePath("/admin/integracoes/pastas");
    return NextResponse.json(result);
  } catch (e) {
    return driveError(e, "link-folder");
  }
}

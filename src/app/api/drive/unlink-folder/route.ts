import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { driveError, requireStaff } from "@/lib/drive-api";
import { unlinkFolder } from "@/lib/drive-sync";

export const dynamic = "force-dynamic";

// Desliga a pasta do cliente. Por padrão os documentos já trazidos ficam; com
// removeDocuments eles vão pra lixeira do portal (30 dias, restaurável; nunca
// sai nada do Drive). dryRun só conta.
export async function POST(request: Request) {
  const auth = await requireStaff(true);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
    folderId?: string;
    removeDocuments?: boolean;
    dryRun?: boolean;
    folderName?: string;
  } | null;
  if (!body?.clientId || !body?.folderId) return NextResponse.json({ error: "Informe o cliente e a pasta." }, { status: 400 });
  try {
    const result = await unlinkFolder(body.clientId, body.folderId, {
      removeDocuments: !!body.removeDocuments,
      dryRun: !!body.dryRun,
      by: auth.profile.id,
      folderName: typeof body.folderName === "string" ? body.folderName.slice(0, 200) : undefined,
    });
    if (!body.dryRun) {
      revalidatePath("/admin/integracoes/pastas");
      revalidatePath("/admin/documents");
      revalidatePath(`/admin/clients/${body.clientId}`);
      revalidatePath("/admin/lixeira");
    }
    return NextResponse.json(result);
  } catch (e) {
    return driveError(e, "unlink-folder");
  }
}

import { NextResponse } from "next/server";
import { driveError, requireStaff } from "@/lib/drive-api";
import { getDriveSession, listFolders } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Navegação pelo Drive do escritório (pastas de um nível, "compartilhados
// comigo" ou busca por nome). SÓ ADMIN: expõe o Drive todo, não só as pastas dos
// clientes.
export async function GET(request: Request) {
  const auth = await requireStaff(true);
  if (auth.error) return auth.error;
  const sp = new URL(request.url).searchParams;
  try {
    const session = await getDriveSession();
    if (!session) return NextResponse.json({ error: "O Google Drive não está conectado." }, { status: 503 });
    if (!session.canRead) return NextResponse.json({ error: "Falta a permissão de leitura do Drive. Reconecte em Integrações." }, { status: 403 });
    const q = sp.get("q")?.trim();
    const folders = await listFolders(session.token, {
      parent: sp.get("parent") ?? undefined,
      shared: sp.get("shared") === "1",
      query: q && q.length >= 2 ? q : undefined,
    });
    return NextResponse.json({ folders });
  } catch (e) {
    return driveError(e, "browse");
  }
}

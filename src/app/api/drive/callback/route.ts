import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearDriveHealthCache, createFolder, DRIVE_ROOT_FOLDER_NAME, exchangeCode, getDriveConnection } from "@/lib/google-drive";

export async function GET(request: Request) {
  const { profile } = await exigirPermissao("integracoes");
  const url = new URL(request.url);
  const origin = url.origin;
  const back = (status: string) => NextResponse.redirect(`${origin}/admin/integracoes?drive=${status}`);

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("drive_oauth_state")?.value;
  cookieStore.delete({ name: "drive_oauth_state", path: "/api/drive" });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("negado");
  if (!code || !state || !expectedState || state !== expectedState) return back("erro");

  try {
    const { accessToken, refreshToken, email } = await exchangeCode(origin, code);
    const admin = createAdminClient();
    const existing = await getDriveConnection();

    // Reconectar a MESMA conta reaproveita a pasta raiz (com escopo drive.file
    // o app continua enxergando o que ele mesmo criou). Conta diferente =
    // pasta raiz nova, e as subpastas de clientes antigas deixam de valer.
    let rootFolderId = existing?.root_folder_id;
    if (!rootFolderId || existing?.account_email !== email) {
      rootFolderId = await createFolder(accessToken, DRIVE_ROOT_FOLDER_NAME);
      await admin.from("clients").update({ drive_folder_id: null }).not("drive_folder_id", "is", null);
    }

    const { error } = await admin.from("drive_connection").upsert({
      id: true,
      account_email: email,
      refresh_token: refreshToken,
      root_folder_id: rootFolderId,
      connected_by: profile.id,
      connected_at: new Date().toISOString(),
    });
    if (error) return back("erro");
  } catch (error) {
    console.error("Drive callback:", error);
    const msg = error instanceof Error ? error.message : "";
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return back("api-desativada");
    if (/invalid_client|invalid_grant|redirect_uri/i.test(msg)) return back("credenciais");
    return back("erro");
  }

  clearDriveHealthCache();
  return back("ok");
}

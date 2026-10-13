import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/dal";
import { buildAuthUrl, isDriveConfigured } from "@/lib/google-drive";

// Inicia a autorização do Google Drive. Só admin. O `state` aleatório vai num
// cookie httpOnly e é conferido no callback (proteção contra CSRF).
export async function GET(request: Request) {
  await requireRole(["admin"]);
  const origin = new URL(request.url).origin;

  if (!isDriveConfigured()) {
    return NextResponse.redirect(`${origin}/admin/integracoes?drive=sem-config`);
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("drive_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/drive",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(origin, state));
}

import { NextResponse } from "next/server";
import { driveError, requireStaff } from "@/lib/drive-api";
import { suggestFolders } from "@/lib/drive-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sugere, pro nome de cada cliente sem pasta, uma pasta parecida no Drive. Só sugere.
export async function GET() {
  const auth = await requireStaff(true);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ suggestions: await suggestFolders() });
  } catch (e) {
    return driveError(e, "suggestions");
  }
}

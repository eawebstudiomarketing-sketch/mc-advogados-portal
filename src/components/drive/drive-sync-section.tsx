import { getProfile } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriveHealth } from "@/lib/google-drive";
import { DriveSyncBar } from "./drive-sync-bar";

// "hoje às 03:00", "ontem às 03:00" ou "23/09 às 03:00" (fuso da Bahia)
function whenText(iso: string): string {
  const tz = "America/Bahia";
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  const today = day(new Date());
  const yesterday = day(new Date(Date.now() - 86_400_000));
  if (day(d) === today) return `hoje às ${time}`;
  if (day(d) === yesterday) return `ontem às ${time}`;
  return `${new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(d)} às ${time}`;
}

async function lastSyncOf(clientId?: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    if (clientId) {
      const { data } = await admin.from("clients").select("drive_last_sync_at").eq("id", clientId).maybeSingle();
      return data?.drive_last_sync_at ? whenText(data.drive_last_sync_at) : null;
    }
    const { data } = await admin
      .from("clients")
      .select("drive_last_sync_at")
      .not("drive_last_sync_at", "is", null)
      .order("drive_last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.drive_last_sync_at ? whenText(data.drive_last_sync_at) : null;
  } catch {
    return null; // migration 0010 ainda não aplicada
  }
}

// Botão "Sincronizar com o Drive". Só aparece quando a conexão está REAL e
// funcionando (teste de verdade a cada ~1 min). Se o Drive foi conectado mas
// parou de responder, mostra um aviso pra reconectar. Sem conexão, nada.
export async function DriveSyncSection(props: { clientId?: string; clients?: { id: string; name: string }[] }) {
  const [health, profile] = await Promise.all([getDriveHealth(), getProfile()]);
  if (!profile || (profile.role !== "admin" && profile.role !== "advogado")) return null;
  const isAdmin = profile.role === "admin";

  if (health.ok) {
    return (
      <DriveSyncBar
        canRead={health.canRead}
        isAdmin={isAdmin}
        lastSync={await lastSyncOf(props.clientId)}
        clientId={props.clientId}
        clients={props.clients}
      />
    );
  }

  if (health.state === "error") {
    return (
      <div className="mb-4 rounded-xl border border-status-danger px-4 py-3 text-xs text-status-danger">
        O Google Drive está conectado, mas não respondeu agora — a sincronização ficou indisponível.{" "}
        {isAdmin ? (
          <a href="/admin/integracoes" className="font-medium underline">
            Ver em Integrações e reconectar
          </a>
        ) : (
          "Avise um administrador."
        )}
      </div>
    );
  }
  return null;
}

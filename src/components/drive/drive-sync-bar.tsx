"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  canRead: boolean;
  isAdmin: boolean;
  lastSync: string | null; // texto pronto ("hoje às 03:00")
  clientId?: string; // ficha do cliente: sincroniza só ele
  clients?: { id: string; name: string }[]; // lista geral: sincroniza todos
};

type SyncOut = { imported: number; exported: number; failed: unknown[]; missingInDrive: number; canRead: boolean };

async function syncOne(clientId: string): Promise<SyncOut> {
  const res = await fetch("/api/drive/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<SyncOut>;
  if (!res.ok) throw new Error(body.error ?? "Não foi possível sincronizar. Tente novamente.");
  return body as SyncOut;
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

// Um botão só. Traz o que é novo do Drive e manda pro Drive o que falta, sem
// listas nem escolhas. Nas páginas com mais de um cliente, percorre um por um.
export function DriveSyncBar({ canRead, isAdmin, lastSync, clientId, clients }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function run() {
    const targets = clientId ? [{ id: clientId, name: "" }] : (clients ?? []);
    if (targets.length === 0) return setMessage({ text: "Nenhum cliente para sincronizar.", ok: false });
    setBusy(true);
    setMessage(null);
    const total = { imported: 0, exported: 0, failed: 0, missing: 0 };
    try {
      for (let i = 0; i < targets.length; i++) {
        setProgress(targets.length > 1 ? `Sincronizando ${i + 1} de ${targets.length}...` : "Sincronizando...");
        const r = await syncOne(targets[i].id);
        total.imported += r.imported;
        total.exported += r.exported;
        total.failed += r.failed.length;
        total.missing += r.missingInDrive;
      }
      const parts: string[] = [];
      if (total.imported) parts.push(`${plural(total.imported, "arquivo novo veio", "arquivos novos vieram")} do Drive`);
      if (total.exported) parts.push(`${plural(total.exported, "arquivo foi enviado", "arquivos foram enviados")} para o Drive`);
      const base = parts.length ? `Pronto: ${parts.join(" e ")}.` : "Tudo em dia — não havia nada de novo.";
      const warn: string[] = [];
      if (total.failed) warn.push(`${plural(total.failed, "item não pôde ser enviado", "itens não puderam ser enviados")} (tente de novo)`);
      if (total.missing) warn.push(`${plural(total.missing, "documento aponta", "documentos apontam")} para arquivo que sumiu do Drive`);
      setMessage({ text: warn.length ? `${base} Atenção: ${warn.join("; ")}.` : base, ok: warn.length === 0 });
      router.refresh();
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 ui-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-full bg-status-success" />
          Google Drive conectado
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="ui-btn px-3 py-1.5 text-xs"
        >
          {progress ?? "Sincronizar com o Drive"}
        </button>
        {isAdmin && (
          <Link href="/admin/integracoes/pastas" className="ui-link">
            Pastas dos clientes →
          </Link>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">
        {lastSync ? `Última sincronização: ${lastSync}. ` : "Ainda não sincronizado. "}O portal também sincroniza sozinho toda madrugada. Subpastas chamadas &quot;Interno&quot; não são trazidas para o portal.
      </p>

      {!canRead && (
        <p className="mt-2 text-xs text-status-pending">
          O portal ainda não tem permissão para ler o Drive, então só consegue enviar arquivos para lá.{" "}
          {isAdmin ? (
            <a href="/api/drive/connect" className="font-medium underline">
              Reconectar o Drive
            </a>
          ) : (
            "Peça a um administrador para reconectar em Integrações."
          )}
        </p>
      )}
      {message && <p className={`mt-2 text-xs ${message.ok ? "text-status-success" : "text-status-danger"}`}>{message.text}</p>}
    </div>
  );
}

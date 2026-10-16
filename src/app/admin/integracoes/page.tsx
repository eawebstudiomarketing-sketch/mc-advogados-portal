import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { clearDriveHealthCache, getDriveConnection, getDriveHealth, isDriveConfigured } from "@/lib/google-drive";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { disconnectDriveAction } from "./actions";

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "Google Drive conectado com sucesso.", ok: true },
  negado: { text: "A autorização foi negada no Google. Nada foi conectado.", ok: false },
  erro: { text: "Não foi possível concluir a conexão. Tente novamente.", ok: false },
  "sem-config": { text: "As credenciais do Google ainda não foram configuradas no servidor.", ok: false },
  "api-desativada": { text: "A API do Google Drive está desativada no projeto do Google Cloud. Ative-a e tente de novo em alguns minutos.", ok: false },
  credenciais: { text: "O Google recusou as credenciais (ID/segredo ou endereço de retorno). Confira a configuração no Google Cloud.", ok: false },
};

export default async function IntegracoesPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  await requireRole(["admin"]);
  const { drive } = await searchParams;
  const connection = await getDriveConnection();
  const configured = isDriveConfigured();
  clearDriveHealthCache(); // esta tela sempre testa a conexão de verdade
  const health = await getDriveHealth();
  const message = drive ? MESSAGES[drive] : undefined;

  return (
    <div>
      <p className="eyebrow mb-2">Escritório · Integrações</p>
      <h1 className="page-title">Integrações</h1>
      <p className="mb-6 text-sm text-muted">Serviços externos conectados ao portal.</p>

      {message && (
        <p
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            message.ok ? "border-status-success text-status-success" : "border-status-danger text-status-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      <section className="max-w-2xl overflow-hidden ui-card">
        <div className="bg-navy px-4 py-2.5 text-sm font-semibold text-navy-foreground">Google Drive</div>
        <div className="space-y-3 px-4 py-4 text-sm">
          <p className="text-foreground/70">
            Os documentos enviados no portal passam a ser guardados no Drive do escritório, em uma pasta por cliente
            dentro de &quot;Clientes MC&quot;. O portal <strong>lê</strong> o Drive para importar e sincronizar o que a
            equipe colocar nessas pastas ou nas pastas que um administrador escolher importar, mas <strong>só escreve</strong> nas pastas e arquivos que ele mesmo cria:
            nunca altera nem apaga arquivos que não sejam dele. Os clientes continuam vendo os documentos pelo portal,
            sem acesso direto ao Drive.
          </p>

          {connection ? (
            <>
              <p>
                <span className="font-medium text-foreground">Conectado:</span> {connection.account_email}
                <span className="text-muted">
                  {" "}
                  · desde {new Date(connection.connected_at).toLocaleDateString("pt-BR")}
                </span>
              </p>
              <p className="text-xs">
                {health.state === "ok" ? (
                  <>
                    <span className="font-medium text-status-success">● Funcionando</span>
                    <span className="text-muted"> — {health.canRead ? "leitura e escrita liberadas (importar, exportar e sincronizar)" : "só escrita liberada; reconecte para liberar importar e sincronizar"}</span>
                  </>
                ) : health.state === "error" ? (
                  <span className="font-medium text-status-danger">● Sem resposta do Google — reconecte. ({health.reason.slice(0, 120)})</span>
                ) : null}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/admin/integracoes/pastas"
                  className="ui-btn px-3 py-1.5 text-xs"
                >
                  Pastas dos clientes
                </Link>
                <a
                  href="/api/drive/connect"
                  className="ui-btn-secondary px-3 py-1.5 text-xs"
                >
                  Reconectar
                </a>
                <ConfirmSubmitButton
                  action={disconnectDriveAction}
                  hiddenFields={{}}
                  confirmMessage="Desconectar o Google Drive? Documentos que já estão no Drive não abrirão até reconectar."
                  label="Desconectar"
                  className="rounded-lg border border-status-danger px-3 py-1.5 text-xs font-medium text-status-danger hover:bg-status-danger hover:text-white"
                />
              </div>
            </>
          ) : configured ? (
            <>
              <p className="text-muted">
                Não conectado. Quem for conectar deve entrar com a conta Google do escritório (a do Maurício).
              </p>
              <a
                href="/api/drive/connect"
                className="ui-btn px-3 py-1.5 text-xs"
              >
                Conectar Google Drive
              </a>
            </>
          ) : (
            <p className="text-status-danger">
              As credenciais do Google (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET) ainda não foram configuradas no
              servidor.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

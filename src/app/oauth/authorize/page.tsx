import { redirect } from "next/navigation";
import { getProfile } from "@/lib/dal";
import { mcpDb, redirectAllowed } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="w-full ui-card p-6">{children}</div>
    </main>
  );
}

// Tela em que a equipe autoriza o Claude a operar o portal. Precisa estar logada.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const clientId = one(sp.client_id);
  const redirectUri = one(sp.redirect_uri);
  const challenge = one(sp.code_challenge);
  const state = one(sp.state);

  const { data: client } = clientId
    ? await mcpDb().from("mcp_oauth_clients").select("client_name, redirect_uris").eq("client_id", clientId).maybeSingle()
    : { data: null };

  if (!client || !redirectAllowed(client.redirect_uris, redirectUri) || one(sp.response_type) !== "code" || !challenge || one(sp.code_challenge_method) !== "S256") {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-navy">Pedido de conexão inválido</h1>
        <p className="mt-2 text-sm text-foreground/70">Volte ao Claude e tente adicionar o conector de novo.</p>
      </Shell>
    );
  }

  const profile = await getProfile();
  if (!profile) {
    const back = `/oauth/authorize?${new URLSearchParams(Object.entries(sp).map(([k, v]) => [k, one(v)])).toString()}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  if (profile.role === "client") {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-navy">Acesso restrito à equipe</h1>
        <p className="mt-2 text-sm text-foreground/70">Sua conta é de cliente. Entre com uma conta de administrador ou advogado.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-navy">Conectar o Claude ao Portal MC</h1>
      <p className="mt-2 text-sm text-foreground/70">
        <strong>{client.client_name ?? "Aplicativo sem nome"}</strong> (volta para <strong>{new URL(redirectUri).host}</strong>) quer acessar o portal como <strong>{profile.full_name}</strong>. Poderá consultar clientes, processos,
        atividades, documentos e financeiro, e também criar, editar e excluir registros. Tudo fica registrado no log de auditoria. Só permita se você mesmo iniciou esta conexão e reconhece o endereço acima.
      </p>
      <form method="POST" action="/oauth/consent" className="mt-5 flex gap-2">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={challenge} />
        <input type="hidden" name="state" value={state} />
        <button name="decision" value="allow" className="ui-btn">
          Permitir
        </button>
        <button name="decision" value="deny" className="ui-btn-secondary px-3 py-1.5 text-xs">
          Cancelar
        </button>
      </form>
    </Shell>
  );
}

import { siteUrl } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

// RFC 9728: diz ao Claude onde está o recurso (o MCP) e quem autoriza o acesso.
export function GET() {
  return Response.json({
    resource: `${siteUrl()}/api/mcp`,
    authorization_servers: [siteUrl()],
    bearer_methods_supported: ["header"],
    resource_name: "Portal MC Advogados",
  });
}

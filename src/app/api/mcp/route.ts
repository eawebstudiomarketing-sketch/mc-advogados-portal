import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "@/lib/mcp/tools";
import { unauthorized, verifyBearer } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Servidor MCP do portal (Streamable HTTP, sem sessão). Cada chamada é
// autenticada por um token OAuth emitido a alguém da equipe.
async function handle(request: Request) {
  const who = await verifyBearer(request);
  if (!who) return unauthorized();

  const server = new McpServer({ name: "portal-mc-advogados", version: "1.0.0" });
  registerTools(server, who);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";

// Endereço do reloginho aberto direto (link copiado, F5): leva à própria rotina
// na página Rotinas. Clicando no reloginho, a rotina abre num cartão por cima da
// tela atual (src/app/admin/@rotina/(.)rotina-hoje).
export default async function RotinaHoje() {
  const profile = await requireRole(["admin", "advogado"]);
  const eu = await responsavelDoPerfil(profile.id);
  redirect(eu ? `/admin/rotinas?pessoa=${eu}` : "/admin/rotinas");
}

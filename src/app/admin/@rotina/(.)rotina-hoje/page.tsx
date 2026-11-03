import type { SupabaseClient } from "@supabase/supabase-js";
import { ehSuperAdmin, requireRole } from "@/lib/dal";
import { listPessoas } from "@/lib/data/escritorio";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { listarItensRotina } from "@/lib/data/rotina-diaria";
import { hojeBahia } from "@/lib/periodo";
import { createAdminClient } from "@/lib/supabase/admin";
import { modelosAtribuidos } from "@/lib/rotina-relatorio/dados";
import { ModalRotina } from "@/components/rotina/modal-rotina";
import { rotinaDaPessoa } from "../../rotinas/rotina-da-pessoa";

// Reloginho do topo (03/11/2026): abre a rotina COMPLETA de hoje (tarefas fixas,
// relatório em etapas com as perguntas e, para o admin máximo, os relatórios da
// equipe) por cima da tela em que a pessoa está, sem ir para Rotinas.

export default async function RotinaDeHojeNoCartao() {
  const profile = await requireRole(["admin", "advogado"]);
  const adm = createAdminClient() as unknown as SupabaseClient;
  const [pessoas, eu, itensTodos, atribuidos] = await Promise.all([listPessoas(), responsavelDoPerfil(profile.id), listarItensRotina(undefined, adm), modelosAtribuidos()]);
  const alvo = pessoas.find((p) => p.id === eu);
  if (!alvo) {
    return (
      <ModalRotina titulo="Sua rotina" fecharHref="/admin/rotinas" voltar>
        <p className="text-sm text-muted">Você ainda não tem rotina definida. Quem define é o administrador.</p>
      </ModalRotina>
    );
  }
  return rotinaDaPessoa({
    alvo,
    aba: "hoje",
    sp: {},
    eu,
    hoje: hojeBahia(),
    souSuper: ehSuperAdmin(profile),
    adm,
    pessoas,
    itensTodos,
    comItens: new Set(itensTodos.map((i) => i.responsavel_id)),
    atribuidos,
    modal: true,
  });
}

import { exigirPermissao } from "@/lib/dal";
import { getConfigEnvio, listMarcasZap, listModelos } from "@/lib/marcas/zap";
import { PainelZap } from "./painel-zap";

// Marcas → WhatsApp (30/10/2026): informativo das marcas para cada cliente.
// Um modelo de mensagem por status (editável), lista para mandar uma, as
// selecionadas ou todas, e o envio automático num dia do mês.

export default async function MarcasWhatsappPage() {
  await exigirPermissao("marcas");
  const [marcas, modelos, config] = await Promise.all([listMarcasZap(), listModelos(), getConfigEnvio()]);
  // status que aparecem na carteira + os dos modelos (para o seletor de status)
  const status = [...new Set([...modelos.map((m) => m.status), ...marcas.map((m) => m.situacao).filter((x): x is string => !!x)])];
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow mb-2">Marcas · INPI</p>
        <h1 className="page-title">WhatsApp</h1>
        <p className="text-sm text-muted">Mande para cada cliente a situação da marca dele. A mensagem segue o modelo do status, e tudo pode ser editado aqui.</p>
      </div>
      <PainelZap marcas={marcas} modelos={modelos} config={config} status={status} />
    </div>
  );
}

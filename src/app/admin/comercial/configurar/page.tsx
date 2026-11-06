import { exigirPermissao } from "@/lib/dal";
import { equipeComercial, lerConfig, listarEtapas } from "@/lib/crm/dados";
import { ConfigPixels } from "./config-pixels";
import { EditorEtapas } from "./editor-etapas";

// Pixels e ajustes do CRM (06/11/2026): Meta (pixel + API de Conversões),
// Google (GA4 + Ads), quem recebe os leads (rodízio), aviso no Zap e etapas.

export default async function ConfigurarPage() {
  await exigirPermissao("comercial");
  const [c, equipe, etapas] = await Promise.all([lerConfig(), equipeComercial(), listarEtapas()]);
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-2">Comercial · CRM</p>
        <h1 className="page-title">Pixels e ajustes</h1>
        <p className="text-sm text-muted">Os pixels valem para todos os formulários. O token e o segredo ficam só no servidor: depois de salvos, aparecem escondidos.</p>
      </div>
      <ConfigPixels
        config={{
          meta_pixel_id: c.meta_pixel_id ?? "",
          meta_token_salvo: !!c.meta_capi_token,
          meta_test_code: c.meta_test_code ?? "",
          ga4_id: c.ga4_id ?? "",
          ga4_segredo_salvo: !!c.ga4_api_secret,
          ads_id: c.ads_id ?? "",
          ads_label: c.ads_label ?? "",
          rodizio: c.rodizio,
          avisar_zap: c.avisar_zap,
        }}
        equipe={equipe}
      />
      <EditorEtapas etapas={etapas} />
    </div>
  );
}

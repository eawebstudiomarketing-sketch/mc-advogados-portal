"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { salvarConfigAction, testarMetaAction } from "../actions";

// Pixels (Meta e Google), rodízio de quem recebe o lead e aviso no Zap.

type Config = {
  meta_pixel_id: string;
  meta_token_salvo: boolean;
  meta_test_code: string;
  ga4_id: string;
  ga4_segredo_salvo: boolean;
  ads_id: string;
  ads_label: string;
  rodizio: string[];
  avisar_zap: boolean;
};

function Campo({ nome, rotulo, ajuda, valor, placeholder, tipo = "text" }: { nome: string; rotulo: string; ajuda?: string; valor?: string; placeholder?: string; tipo?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="ui-label">{rotulo}</span>
      <input name={nome} type={tipo} defaultValue={valor} placeholder={placeholder} autoComplete="off" className="ui-input" />
      {ajuda && <span className="block text-xs text-muted">{ajuda}</span>}
    </label>
  );
}

export function ConfigPixels({ config, equipe }: { config: Config; equipe: { id: string; nome: string }[] }) {
  const [salvando, iniciar] = useTransition();
  const [testando, testar] = useTransition();
  return (
    <form
      action={(fd) =>
        iniciar(async () => {
          const r = await salvarConfigAction(fd);
          if (r.ok) toast.success("Salvo.");
          else toast.error(r.erro);
        })
      }
      className="space-y-6"
    >
      <section className="ui-card space-y-4 p-5">
        <div>
          <h2 className="section-title">Meta (Facebook e Instagram)</h2>
          <p className="text-sm text-muted">
            Pixel no navegador + API de Conversões pelo servidor (o lead conta mesmo com bloqueador). Eventos: PageView, ViewContent, Lead, Contact (botão final), Schedule (lead foi para Reunião) e Purchase (lead fechou, com o valor).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo nome="meta_pixel_id" rotulo="ID do Pixel (conjunto de dados)" valor={config.meta_pixel_id} placeholder="123456789012345" ajuda="Gerenciador de Eventos → Fontes de dados → o número abaixo do nome." />
          <Campo
            nome="meta_capi_token"
            tipo="password"
            rotulo="Token da API de Conversões"
            placeholder={config.meta_token_salvo ? "•••••••• salvo (deixe vazio para manter)" : "EAAB..."}
            ajuda="Configurações do pixel → API de Conversões → Gerar token de acesso. Para apagar, escreva só um hífen (-)."
          />
          <Campo nome="meta_test_code" rotulo="Código de teste (opcional)" valor={config.meta_test_code} placeholder="TEST12345" ajuda="Só enquanto testa em Eventos de teste. Apague depois, senão os eventos não contam." />
          <div className="flex items-end">
            <button
              type="button"
              disabled={testando || !config.meta_pixel_id || !config.meta_token_salvo}
              onClick={() =>
                testar(async () => {
                  const r = await testarMetaAction();
                  if (r.ok) toast.success("A Meta recebeu o evento de teste (Lead).");
                  else toast.error(r.erro);
                })
              }
              className="ui-btn-secondary px-4 py-2 text-sm disabled:opacity-50"
            >
              {testando ? "Enviando…" : "Enviar evento de teste"}
            </button>
          </div>
        </div>
      </section>

      <section className="ui-card space-y-4 p-5">
        <div>
          <h2 className="section-title">Google (Analytics 4 e Ads)</h2>
          <p className="text-sm text-muted">
            No navegador: form_start e generate_lead no GA4 e a conversão do Ads quando o formulário é enviado. Com o segredo do Measurement Protocol, o lead que fecha também vai para o GA4 (close_convert_lead).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo nome="ga4_id" rotulo="ID de medição do GA4" valor={config.ga4_id} placeholder="G-XXXXXXXXXX" ajuda="Analytics → Administrador → Fluxos de dados → Web." />
          <Campo
            nome="ga4_api_secret"
            tipo="password"
            rotulo="Segredo do Measurement Protocol (opcional)"
            placeholder={config.ga4_segredo_salvo ? "•••••••• salvo (deixe vazio para manter)" : "no mesmo fluxo de dados"}
            ajuda="Fluxo de dados → Chaves secretas da API do Measurement Protocol → Criar."
          />
          <Campo nome="ads_id" rotulo="ID do Google Ads (opcional)" valor={config.ads_id} placeholder="AW-123456789" />
          <Campo nome="ads_label" rotulo="Rótulo da conversão de lead (opcional)" valor={config.ads_label} placeholder="AbC-D_efG-h12_34-567" ajuda="Ads → Metas → Conversões → a ação de lead → Configuração da tag → send_to: AW-…/ESTE_RÓTULO." />
        </div>
      </section>

      <section className="ui-card space-y-4 p-5">
        <div>
          <h2 className="section-title">Quem recebe os leads</h2>
          <p className="text-sm text-muted">Marque mais de uma pessoa para os leads irem em rodízio (um para cada). Sem ninguém marcado, vai para o responsável escolhido em cada formulário.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {equipe.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground">
              <input type="checkbox" name="rodizio" value={p.id} defaultChecked={config.rodizio.includes(p.id)} className="h-4 w-4" />
              {p.nome}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">Para o Estevão aparecer aqui, ele precisa de login no portal e da permissão “Comercial” (Gestão → Equipe).</p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="avisar_zap" defaultChecked={config.avisar_zap} className="h-4 w-4" />
          Avisar no WhatsApp de quem recebe o lead (além do aviso no portal e no celular)
        </label>
      </section>

      <div className="flex justify-end">
        <button type="submit" disabled={salvando} className="ui-btn px-6 py-2 text-sm">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

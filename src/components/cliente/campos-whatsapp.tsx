// Grupos e números do WhatsApp do cliente. O banco vincula sozinho a conversa
// cujo nome do grupo (ou número) bate com o que estiver aqui — é por ela que
// saem os lembretes de reunião e de onde a Distribuição lê os pedidos.

export function CamposWhatsapp({ grupos = [], numeros = [] }: { grupos?: string[]; numeros?: string[] }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">WhatsApp do cliente</legend>
      <div>
        <label htmlFor="whatsapp_grupos" className="ui-label">
          Nome do(s) grupo(s)
        </label>
        <textarea
          id="whatsapp_grupos"
          name="whatsapp_grupos"
          rows={2}
          defaultValue={grupos.join("\n")}
          placeholder={"MC Advogados | Empresa X"}
          className="ui-input"
        />
        <p className="mt-1 text-xs text-muted">Um por linha, escrito igual ao nome do grupo no WhatsApp (maiúsculas e acentos não importam).</p>
      </div>
      <div>
        <label htmlFor="whatsapp_numeros" className="ui-label">
          Número(s) de contato
        </label>
        <textarea
          id="whatsapp_numeros"
          name="whatsapp_numeros"
          rows={2}
          defaultValue={numeros.join("\n")}
          placeholder={"73 99999-9999"}
          className="ui-input"
        />
        <p className="mt-1 text-xs text-muted">Um por linha, com DDD. Conversas com esses números ficam ligadas ao cliente.</p>
      </div>
    </fieldset>
  );
}

/** Lê os dois campos do formulário (um item por linha, sem repetidos). */
export function lerCamposWhatsapp(formData: FormData): { whatsapp_grupos: string[]; whatsapp_numeros: string[] } {
  const linhas = (campo: string) =>
    [...new Set(String(formData.get(campo) ?? "").split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean))];
  return {
    whatsapp_grupos: linhas("whatsapp_grupos"),
    whatsapp_numeros: linhas("whatsapp_numeros").map((n) => n.replace(/[^\d+]/g, "")).filter((n) => n.replace(/\D/g, "").length >= 10),
  };
}

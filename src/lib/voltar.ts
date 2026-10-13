// Destino depois de salvar um formulário: a tela de onde a pessoa veio
// (campo oculto return_to, preenchido por <VoltarInput />) ou o padrão.
// Só aceita caminhos internos do painel/portal, nunca outro site.
export function destinoDeVolta(formData: FormData, padrao: string, evitar?: string): string {
  const v = formData.get("return_to");
  if (typeof v !== "string") return padrao;
  const ok =
    /^\/(admin|dashboard)(\/|\?|$)/.test(v) &&
    !v.startsWith("//") &&
    !/\/(new|edit)(\?|$)/.test(v) &&
    !(evitar && v.includes(evitar));
  return ok ? v : padrao;
}

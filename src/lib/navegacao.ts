// Trilha de navegação do painel (sessionStorage): lembra por onde a pessoa
// passou para que "voltar" e o "salvar" dos formulários levem de volta para
// onde ela estava (ex.: ficha do cliente na aba Documentos), e não para uma
// lista fixa. Mesma página com outra aba (?aba=) substitui a entrada.

const CHAVE = "mc:trilha";
const MAX = 30;

function ler(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function gravar(trilha: string[]) {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(trilha.slice(-MAX)));
  } catch {}
}

const caminho = (url: string) => url.split("?")[0];

/** Página de formulário (criar/editar): nunca é destino de "voltar". */
export const ehFormulario = (url: string) => /\/(new|edit)$/.test(caminho(url));

/** Registra a tela atual na trilha. */
export function registrarTela(url: string) {
  const t = ler();
  const i = t.indexOf(url);
  if (i >= 0) {
    // voltou para uma tela que já estava na trilha: corta o que veio depois
    gravar(t.slice(0, i + 1));
    return;
  }
  if (t.length && caminho(t[t.length - 1]) === caminho(url)) t[t.length - 1] = url;
  else t.push(url);
  gravar(t);
}

/** Tela anterior à atual (pulando formulários e a própria tela), ou null. */
export function telaAnterior(atual: string): string | null {
  const t = ler();
  for (let i = t.length - 1; i >= 0; i--) {
    const u = t[i];
    if (caminho(u) === caminho(atual) || ehFormulario(u)) continue;
    return u;
  }
  return null;
}

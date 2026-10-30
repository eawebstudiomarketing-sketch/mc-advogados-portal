// Ordem das listas escolhida no ícone "Ordenar" da barra de filtros (?ordem=).
// "campo" = crescente, "-campo" = decrescente; vazio = a ordem que já veio do banco.
// O que não tem valor (sem prazo, sem data) vai sempre para o fim.

type Valor = string | number | null | undefined;

export function ordenar<T>(lista: T[], ordem: string | undefined, campos: Record<string, (x: T) => Valor>): T[] {
  if (!ordem) return lista;
  const desc = ordem.startsWith("-");
  const pegar = campos[desc ? ordem.slice(1) : ordem];
  if (!pegar) return lista;
  return [...lista].sort((a, b) => {
    const x = pegar(a);
    const y = pegar(b);
    const vazioX = x == null || x === "";
    const vazioY = y == null || y === "";
    if (vazioX || vazioY) return vazioX === vazioY ? 0 : vazioX ? 1 : -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { sensitivity: "base", numeric: true });
    return desc ? -c : c;
  });
}

/** Data ISO (aaaa-mm-dd...) em dd/mm/aaaa para a planilha. */
export const dataPlanilha = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

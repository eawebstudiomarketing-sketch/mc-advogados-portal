// Favoritos e Recentes do cabeçalho (itens 3 da auditoria, 30/10/2026).
// Ficam no navegador de cada pessoa (localStorage): é conveniência, não dado
// do escritório. Recentes = últimas fichas de cliente/processo abertas.

export type Atalho = { href: string; nome: string; tipo: "cliente" | "processo" | "tela" };
type Estado = { favoritos: Atalho[]; recentes: Atalho[] };

const CHAVE = "mc:atalhos-v1";
const MAX_RECENTES = 8;
const MAX_FAVORITOS = 20;
const VAZIO = JSON.stringify({ favoritos: [], recentes: [] } satisfies Estado);
const ouvintes = new Set<() => void>();

function lerCru(): string {
  try {
    return localStorage.getItem(CHAVE) ?? VAZIO;
  } catch {
    return VAZIO;
  }
}
function ler(): Estado {
  try {
    const v = JSON.parse(lerCru());
    return { favoritos: Array.isArray(v.favoritos) ? v.favoritos : [], recentes: Array.isArray(v.recentes) ? v.recentes : [] };
  } catch {
    return { favoritos: [], recentes: [] };
  }
}
function gravar(e: Estado) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch {}
  ouvintes.forEach((f) => f());
}

/** Para useSyncExternalStore: o texto guardado (comparável sem recriar objetos). */
export const atalhosStore = {
  assinar(f: () => void) {
    ouvintes.add(f);
    const outraAba = (e: StorageEvent) => e.key === CHAVE && f();
    window.addEventListener("storage", outraAba);
    return () => {
      ouvintes.delete(f);
      window.removeEventListener("storage", outraAba);
    };
  },
  foto: lerCru,
  fotoServidor: () => VAZIO,
};
export const lerAtalhos = (cru: string): Estado => {
  try {
    const v = JSON.parse(cru);
    return { favoritos: v.favoritos ?? [], recentes: v.recentes ?? [] };
  } catch {
    return { favoritos: [], recentes: [] };
  }
};

export function registrarRecente(a: Atalho) {
  const e = ler();
  const recentes = [a, ...e.recentes.filter((x) => x.href !== a.href)].slice(0, MAX_RECENTES);
  // nome mudou (ficha renomeada): atualiza também nos favoritos
  const favoritos = e.favoritos.map((x) => (x.href === a.href ? { ...x, nome: a.nome } : x));
  if (JSON.stringify(recentes) !== JSON.stringify(e.recentes) || JSON.stringify(favoritos) !== JSON.stringify(e.favoritos)) gravar({ favoritos, recentes });
}

export function alternarFavorito(a: Atalho) {
  const e = ler();
  const ja = e.favoritos.some((x) => x.href === a.href);
  gravar({ ...e, favoritos: ja ? e.favoritos.filter((x) => x.href !== a.href) : [a, ...e.favoritos].slice(0, MAX_FAVORITOS) });
}

/** Ficha de cliente ou de processo (as que entram em Recentes). */
export function tipoDaFicha(pathname: string): Atalho["tipo"] | null {
  if (/^\/admin\/clients\/[0-9a-f-]{36}$/i.test(pathname)) return "cliente";
  if (/^\/admin\/processes\/[0-9a-f-]{36}$/i.test(pathname)) return "processo";
  return null;
}

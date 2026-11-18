// Cópia local dos pedaços da gravação de reunião (11/11/2026).
// Uma reunião foi perdida: a aba fechou e só o 1º pedaço tinha subido; o resto estava
// só na memória do navegador. Agora cada pedaço também fica no IndexedDB do navegador
// até o servidor confirmar o recebimento. Se a aba fechar (ou o envio travar), a
// reunião pode ser recuperada depois neste mesmo computador ("Recuperar e transcrever").

const BANCO = "mc-gravacoes";
const LOJA = "pedacos";

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open(BANCO, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

const chave = (ataId: string, n: number) => `${ataId}:${String(n).padStart(6, "0")}`;

async function comLoja<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await abrir();
  if (!db) return null;
  return new Promise((ok) => {
    try {
      const tx = db.transaction(LOJA, modo);
      const req = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => {
        db.close();
        ok(req ? (req.result as T) : null);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        ok(null);
      };
    } catch {
      db.close();
      ok(null);
    }
  });
}

export async function guardarPedaco(ataId: string, n: number, blob: Blob): Promise<void> {
  await comLoja("readwrite", (s) => s.put(blob, chave(ataId, n)));
}

export async function apagarPedaco(ataId: string, n: number): Promise<void> {
  await comLoja("readwrite", (s) => s.delete(chave(ataId, n)));
}

export async function apagarPedacos(ataId: string): Promise<void> {
  await comLoja("readwrite", (s) => s.delete(IDBKeyRange.bound(`${ataId}:`, `${ataId}:￿`)));
}

export async function pedacosGuardados(ataId: string): Promise<{ n: number; blob: Blob }[]> {
  const faixa = IDBKeyRange.bound(`${ataId}:`, `${ataId}:￿`);
  const chaves = ((await comLoja("readonly", (s) => s.getAllKeys(faixa))) ?? []) as string[];
  const blobs = ((await comLoja("readonly", (s) => s.getAll(faixa))) ?? []) as Blob[];
  return chaves.map((k, i) => ({ n: Number(k.split(":")[1]), blob: blobs[i] })).filter((p) => p.blob);
}

/** Sobe os pedaços guardados neste navegador (PUT .../parte/<n>). Devolve quantos subiram e quantos falharam. */
export async function enviarGuardados(ataId: string, base: string): Promise<{ enviados: number; falhas: number }> {
  let enviados = 0;
  let falhas = 0;
  for (const p of await pedacosGuardados(ataId)) {
    try {
      const r = await fetch(base.replace("?", `/parte/${p.n}?`), { method: "PUT", body: p.blob, signal: AbortSignal.timeout(120_000) });
      if (r.ok) {
        enviados++;
        await apagarPedaco(ataId, p.n);
      } else falhas++;
    } catch {
      falhas++;
    }
  }
  return { enviados, falhas };
}

/** Gravações guardadas neste navegador cujo id começa com `prefixo` (ex.: "transcricao-"), com nº de pedaços e tamanho. */
export async function gravacoesGuardadas(prefixo: string): Promise<{ id: string; partes: number; bytes: number }[]> {
  const faixa = IDBKeyRange.bound(prefixo, `${prefixo}￿`);
  const chaves = ((await comLoja("readonly", (s) => s.getAllKeys(faixa))) ?? []) as string[];
  const blobs = ((await comLoja("readonly", (s) => s.getAll(faixa))) ?? []) as Blob[];
  const mapa = new Map<string, { id: string; partes: number; bytes: number }>();
  chaves.forEach((k, i) => {
    const id = k.split(":")[0];
    const g = mapa.get(id) ?? { id, partes: 0, bytes: 0 };
    g.partes++;
    g.bytes += blobs[i]?.size ?? 0;
    mapa.set(id, g);
  });
  return [...mapa.values()];
}

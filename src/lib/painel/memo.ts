import "server-only";

// Guarda por pouco tempo, na memória do servidor, o resultado de contas pesadas do
// Painel do Dono e dos Indicadores (desempenho, 30/10/2026). Quem abre a tela em
// seguida recebe o mesmo cálculo em vez de refazer tudo; os números podem ficar até
// `ttlMs` atrasados. Se a conta falhar, nada fica guardado.

const guardados = new Map<string, { ate: number; valor: Promise<unknown> }>();

export function memo<T>(chave: string, ttlMs: number, calcular: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  const g = guardados.get(chave);
  if (g && g.ate > agora) return g.valor as Promise<T>;
  const valor = calcular();
  guardados.set(chave, { ate: agora + ttlMs, valor });
  valor.catch(() => guardados.delete(chave));
  // não deixa a memória crescer sem limite
  if (guardados.size > 50) for (const [k, v] of guardados) if (v.ate <= agora) guardados.delete(k);
  return valor;
}

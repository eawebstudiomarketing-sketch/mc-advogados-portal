// Ids que chegam das ações em massa (seleção de várias linhas): só uuid, sem repetidos, até 500.
export function idsDoLote(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const limpos = [...new Set(ids.filter((i): i is string => typeof i === "string" && /^[0-9a-f-]{36}$/i.test(i)))];
  return limpos.length && limpos.length <= 500 ? limpos : null;
}

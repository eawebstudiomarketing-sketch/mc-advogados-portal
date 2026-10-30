/** Subtarefa do checklist da atividade (item 21, migration 0059). */
export type ItemChecklist = { id: string; texto: string; feito: boolean };

/** Lê o checklist guardado (sem a coluna ainda, vem vazio). */
export function lerChecklist(v: unknown): ItemChecklist[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x.id === "string" && typeof x.texto === "string")
    .map((x) => ({ id: x.id, texto: x.texto.slice(0, 300), feito: !!x.feito }))
    .slice(0, 50);
}

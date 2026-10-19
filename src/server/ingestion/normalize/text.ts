/** Minúsculas, sem acentos e com espaços colapsados — use para COMPARAR textos, nunca para exibir. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

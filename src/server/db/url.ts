export const PGLITE_PREFIX = 'pglite://';

export function isPgliteUrl(url: string): boolean {
  return url.startsWith(PGLITE_PREFIX);
}

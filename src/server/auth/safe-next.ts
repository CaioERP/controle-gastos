const LOCAL_ORIGIN = 'http://local';

/**
 * Caminho interno seguro para redirecionar após o login.
 * Bloqueia redirecionamento aberto: "//evil.com", "/\evil.com", URLs absolutas e esquemas como "javascript:".
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  try {
    const url = new URL(next, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return '/';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/';
  }
}

/**
 * Utilitário de registro seguro de erros e avisos no servidor.
 * Não vaza segredos, tokens, credenciais em URLs nem chaves longas.
 */

const URL_WITH_CREDS_RE = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s@]+@[^\s]+/g;
const BEARER_RE = /\bBearer\s+\S+/gi;
const QUERY_SECRET_RE = /(?<=[?&]|\b)(?:[a-zA-Z0-9_-]*(?:token|secret|key)|apiKey|api_key)=[^\s&]+/gi;
const LONG_KEY_RE = /\b[A-Za-z0-9_-]{40,}\b/g;

/**
 * Pura, exportada para teste: tira tokens, chaves e URLs com credencial de uma mensagem.
 */
export function redact(text: string): string {
  return text
    .replace(URL_WITH_CREDS_RE, '[redacted]')
    .replace(BEARER_RE, '[redacted]')
    .replace(QUERY_SECRET_RE, '[redacted]')
    .replace(LONG_KEY_RE, '[redacted]');
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message;
  }
  if (typeof err === 'string') return err;
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    const name =
      'name' in err && typeof (err as { name: unknown }).name === 'string'
        ? (err as { name: string }).name
        : '';
    const msg = (err as { message: string }).message;
    return name && name !== 'Error' ? `${name}: ${msg}` : msg;
  }
  return String(err);
}

function formatContext(context?: Record<string, string | number | boolean>): string {
  if (!context || Object.keys(context).length === 0) return '';
  return ` ${JSON.stringify(context)}`;
}

/** Registra um erro do servidor sem vazar segredos. */
export function logServerError(
  scope: string,
  err: unknown,
  context?: Record<string, string | number | boolean>,
): void {
  const errMsg = formatError(err).replace(/\r?\n/g, ' ');
  const ctx = formatContext(context);
  const line = redact(`[${scope}] ${errMsg}${ctx}`);
  console.error(line);
}

/** Registra um aviso do servidor sem vazar segredos. */
export function logServerWarn(
  scope: string,
  message: string,
  context?: Record<string, string | number | boolean>,
): void {
  const cleanMsg = message.replace(/\r?\n/g, ' ');
  const ctx = formatContext(context);
  const line = redact(`[${scope}] ${cleanMsg}${ctx}`);
  console.warn(line);
}

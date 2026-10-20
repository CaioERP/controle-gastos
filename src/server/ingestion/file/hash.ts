import { createHash } from 'node:crypto';
import { normalizeForMatch } from '../normalize/text';

/** SHA-256 hex de string ou bytes (use node:crypto createHash('sha256')). */
export function sha256Hex(content: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else {
    hash.update(content);
  }
  return hash.digest('hex');
}

function isValidNativeId(nativeId: string | null | undefined): nativeId is string {
  if (!nativeId) return false;
  const trimmed = nativeId.trim();
  if (!trimmed) return false;
  if (/^0+$/.test(trimmed)) return false;
  return true;
}

/**
 * Gera externalId determinístico para transação de arquivo sem ID nativo (CSV/PDF)
 * ou com ID nativo (OFX FITID).
 * - Com nativeId (FITID não vazio e diferente de '0'/'000000'): `ofx:${accountId}:${nativeId.trim()}`
 * - Sem nativeId: `file:${sha256Hex(`${accountId}|${date}|${amountCents}|${normalizeForMatch(descriptionRaw)}|${dayOccurrence}`).slice(0, 32)}`
 *
 * `dayOccurrence` é o índice 1-based entre transações idênticas (mesma data, mesmo valor em centavos
 * e mesma descrição normalizada) dentro do MESMO arquivo, na ordem em que aparecem.
 */
export function buildFileExternalId(input: {
  accountId: string;
  date: string;
  amountCents: number;
  descriptionRaw: string;
  dayOccurrence: number;
  nativeId?: string | null;
}): string {
  if (isValidNativeId(input.nativeId)) {
    return `ofx:${input.accountId}:${input.nativeId.trim()}`;
  }
  const key = `${input.accountId}|${input.date}|${input.amountCents}|${normalizeForMatch(input.descriptionRaw)}|${input.dayOccurrence}`;
  return `file:${sha256Hex(key).slice(0, 32)}`;
}

export function assignDayOccurrences<
  T extends { date: string; amountCents: number; descriptionRaw: string },
>(items: T[]): Array<T & { dayOccurrence: number }> {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const key = `${item.date}|${item.amountCents}|${normalizeForMatch(item.descriptionRaw)}`;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return { ...item, dayOccurrence: next };
  });
}

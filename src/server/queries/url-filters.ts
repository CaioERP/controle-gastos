import { z } from 'zod';
import { PAYMENT_METHODS, TX_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import { defaultFilters, txFiltersSchema, type TxFilters } from '@/server/domain/filters';
import { monthEnd, today } from '@/server/domain/dates';

const uuidSchema = z.string().uuid();

/** Parâmetros de URL que representam filtros (`TxFilters`). Os demais pertencem a cada página. */
export const FILTER_PARAM_KEYS = [
  'mes',
  'de',
  'ate',
  'inst',
  'contas',
  'natureza',
  'forma',
  'cat',
  'tag',
  'q',
  'regime',
  'projetadas',
  'revisao',
] as const;

const FILTER_PARAM_SET = new Set<string>(FILTER_PARAM_KEYS);

/**
 * Valida `YYYY-MM-DD` só com aritmética em UTC, sem depender do fuso da máquina
 * (parseISO usa meia-noite local, o que quebrava a comparação em fusos a leste de UTC).
 */
function isValidDateString(d: unknown): d is string {
  if (typeof d !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const day = Number(match[3]);
  if (m < 1 || m > 12 || day < 1) return false;
  const utc = new Date(Date.UTC(y, m - 1, day));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === day;
}

function isValidMonthString(m: unknown): m is string {
  if (typeof m !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return false;
  return isValidDateString(`${m}-01`);
}

function parseUuids(val: unknown): string[] | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined;
  const items = val.split(',').map((s) => s.trim()).filter((s) => uuidSchema.safeParse(s).success);
  return items.length > 0 ? items : undefined;
}

function parseKinds(val: unknown): TxKind[] | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined;
  const valid = new Set<string>(TX_KINDS);
  const items = val.split(',').map((s) => s.trim()).filter((s): s is TxKind => valid.has(s));
  return items.length > 0 ? items : undefined;
}

function parsePaymentMethods(val: unknown): PaymentMethod[] | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined;
  const valid = new Set<string>(PAYMENT_METHODS);
  const items = val.split(',').map((s) => s.trim()).filter((s): s is PaymentMethod => valid.has(s));
  return items.length > 0 ? items : undefined;
}

export type RawFilterParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams
  | string;

/** Todos os pares chave/valor da entrada, na ordem original (inclui valores repetidos). */
function toParamEntries(input: RawFilterParams): Array<[string, string]> {
  if (typeof input === 'string') {
    const raw = input.startsWith('?') ? input.slice(1) : input;
    return [...new URLSearchParams(raw).entries()];
  }
  if (input instanceof URLSearchParams) {
    return [...input.entries()];
  }
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v)) {
      for (const item of v) entries.push([k, item]);
    } else if (typeof v === 'string') {
      entries.push([k, v]);
    }
  }
  return entries;
}

function toParamRecord(input: RawFilterParams): Record<string, string | undefined> {
  if (typeof input === 'string') {
    const raw = input.startsWith('?') ? input.slice(1) : input;
    const sp = new URLSearchParams(raw);
    const rec: Record<string, string | undefined> = {};
    for (const [k, v] of sp.entries()) {
      rec[k] = v;
    }
    return rec;
  }
  if (input instanceof URLSearchParams) {
    const rec: Record<string, string | undefined> = {};
    for (const [k, v] of input.entries()) {
      rec[k] = v;
    }
    return rec;
  }
  const rec: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v)) {
      rec[k] = v[0];
    } else if (typeof v === 'string') {
      rec[k] = v;
    }
  }
  return rec;
}

/**
 * Converte parâmetros de URL em TxFilters validados.
 * Valores inválidos são ignorados silenciosamente (nunca lançam erro).
 */
export function parseFilters(params: RawFilterParams, ref: string = today()): TxFilters {
  const p = toParamRecord(params);
  const base = defaultFilters(ref);

  let from: string | undefined;
  let to: string | undefined;

  // 1. Período: "mes" tem prioridade sobre "de"/"ate"
  if (p.mes && isValidMonthString(p.mes)) {
    from = `${p.mes}-01`;
    to = monthEnd(from);
  } else {
    const validDe = p.de && isValidDateString(p.de) ? p.de : undefined;
    const validAte = p.ate && isValidDateString(p.ate) ? p.ate : undefined;

    if (validDe && validAte) {
      if (validDe <= validAte) {
        from = validDe;
        to = validAte;
      } else {
        from = validAte;
        to = validDe;
      }
    } else if (validDe) {
      from = validDe;
      to = validDe;
    } else if (validAte) {
      from = validAte;
      to = validAte;
    }
  }

  if (!from || !to) {
    from = base.from;
    to = base.to;
  }

  const institutionIds = parseUuids(p.inst);
  const accountIds = parseUuids(p.contas);
  const kinds = parseKinds(p.natureza);
  const paymentMethods = parsePaymentMethods(p.forma);
  const categoryIds = parseUuids(p.cat);
  const tagIds = parseUuids(p.tag);

  let basis: 'accrual' | 'cash' | undefined;
  if (p.regime === 'caixa') basis = 'cash';
  else if (p.regime === 'competencia') basis = 'accrual';

  const includeProjected = p.projetadas === '1' || p.projetadas === 'true' ? true : undefined;
  const needsReview = p.revisao === '1' || p.revisao === 'true' ? true : undefined;
  const search = p.q && p.q.trim().length > 0 ? p.q.trim().slice(0, 200) : undefined;

  const result: TxFilters = {
    from,
    to,
    ...(institutionIds ? { institutionIds } : {}),
    ...(accountIds ? { accountIds } : {}),
    // Sem `natureza` na URL, `kinds` fica ausente: cada consulta aplica o seu padrão
    // (agregações: naturezas reportáveis, R2; lista de transações: todas).
    ...(kinds ? { kinds } : {}),
    ...(paymentMethods ? { paymentMethods } : {}),
    ...(categoryIds ? { categoryIds } : {}),
    ...(tagIds ? { tagIds } : {}),
    ...(search ? { search } : {}),
    basis: basis ?? base.basis ?? 'accrual',
    ...(includeProjected ? { includeProjected: true } : {}),
    ...(needsReview ? { needsReview: true } : {}),
  };

  return txFiltersSchema.parse(result);
}

/**
 * Serializa TxFilters para query string (sem o '?' inicial).
 * Omite período e regime iguais à base (ou padrão de defaultFilters). `kinds` presente vira `natureza`.
 */
export function serializeFilters(f: Partial<TxFilters>, base?: TxFilters): string {
  const b = base ?? defaultFilters();
  const sp = new URLSearchParams();

  if (f.from && f.to) {
    const isFullCalendarMonth =
      f.from.endsWith('-01') && f.to === monthEnd(f.from);

    if (isFullCalendarMonth) {
      const monthStr = f.from.slice(0, 7);
      const baseMonthStr = b.from.slice(0, 7);
      const baseIsFullMonth = b.from.endsWith('-01') && b.to === monthEnd(b.from);
      if (!baseIsFullMonth || monthStr !== baseMonthStr) {
        sp.set('mes', monthStr);
      }
    } else if (f.from !== b.from || f.to !== b.to) {
      sp.set('de', f.from);
      sp.set('ate', f.to);
    }
  }

  if (f.institutionIds && f.institutionIds.length > 0) {
    sp.set('inst', f.institutionIds.join(','));
  }
  if (f.accountIds && f.accountIds.length > 0) {
    sp.set('contas', f.accountIds.join(','));
  }

  // Natureza escolhida explicitamente vai sempre para a URL, mesmo igual ao padrão das agregações:
  // a lista de transações tem outro padrão (todas) e o link precisa reproduzir o valor do gráfico.
  if (f.kinds && f.kinds.length > 0) {
    sp.set('natureza', f.kinds.join(','));
  }

  if (f.paymentMethods && f.paymentMethods.length > 0) {
    sp.set('forma', f.paymentMethods.join(','));
  }
  if (f.categoryIds && f.categoryIds.length > 0) {
    sp.set('cat', f.categoryIds.join(','));
  }
  if (f.tagIds && f.tagIds.length > 0) {
    sp.set('tag', f.tagIds.join(','));
  }
  if (f.search && f.search.trim()) {
    sp.set('q', f.search.trim());
  }

  if (f.basis && f.basis !== (b.basis ?? 'accrual')) {
    sp.set('regime', f.basis === 'cash' ? 'caixa' : 'competencia');
  }

  if (f.includeProjected) {
    sp.set('projetadas', '1');
  }
  if (f.needsReview) {
    sp.set('revisao', '1');
  }

  return sp.toString();
}

/**
 * Aplica `patch` aos filtros da query string atual e devolve a nova query string (sem '?').
 * Parâmetros de filtro são reescritos (campo `undefined` no patch remove o filtro);
 * qualquer outro parâmetro (ex.: `dim`, `cartao`, `fatura`, `aba`) é preservado como está.
 * `current`, se informado, substitui os filtros lidos de `currentSearch`.
 */
export function mergeFilterParams(
  currentSearch: RawFilterParams,
  patch: Partial<TxFilters>,
  current?: TxFilters,
  ref: string = today()
): string {
  const existing = current ?? parseFilters(currentSearch, ref);
  const merged: TxFilters = {
    ...existing,
    ...patch,
    from: patch.from ?? existing.from,
    to: patch.to ?? existing.to,
  };

  const out = new URLSearchParams();
  for (const [k, v] of toParamEntries(currentSearch)) {
    if (!FILTER_PARAM_SET.has(k)) out.append(k, v);
  }
  const filterParams = new URLSearchParams(serializeFilters(merged, defaultFilters(ref)));
  for (const [k, v] of filterParams.entries()) {
    out.append(k, v);
  }
  return out.toString();
}

/**
 * Constrói URL com filtros atualizados (usado em links e navegação por drill-down).
 * Parâmetros de `href` que não são filtros são preservados.
 */
export function withFilters(href: string, patch: Partial<TxFilters>, current: TxFilters): string {
  const [pathname = '', rawQuery] = href.split('?');
  const qs = rawQuery ? mergeFilterParams(rawQuery, patch) : mergeFilterParams('', patch, current);
  return qs ? `${pathname}?${qs}` : pathname;
}

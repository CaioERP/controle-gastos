import { isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import { PAYMENT_METHODS, REPORTABLE_KINDS, TX_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import { defaultFilters, txFiltersSchema, type TxFilters } from '@/server/domain/filters';
import { monthEnd, today } from '@/server/domain/dates';

const uuidSchema = z.string().uuid();

function isValidDateString(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parsed = parseISO(d);
  if (!isValid(parsed)) return false;
  const [y, m, day] = d.split('-').map(Number);
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() + 1 === m &&
    parsed.getUTCDate() === day
  );
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
    kinds: kinds ?? base.kinds,
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
 * Omite valores iguais à base (ou padrão de defaultFilters).
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

  if (f.kinds && f.kinds.length > 0) {
    const defaultSet = new Set(REPORTABLE_KINDS);
    const isDefault =
      f.kinds.length === defaultSet.size &&
      f.kinds.every((k) => defaultSet.has(k));
    if (!isDefault) {
      sp.set('natureza', f.kinds.join(','));
    }
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
 * Constrói URL com filtros atualizados (usado em links e navegação por drill-down).
 */
export function withFilters(href: string, patch: Partial<TxFilters>, current: TxFilters): string {
  const [pathname = '', rawQuery] = href.split('?');
  const existingFilters = rawQuery ? parseFilters(rawQuery) : current;
  const merged: TxFilters = {
    ...existingFilters,
    ...patch,
    from: patch.from ?? existingFilters.from,
    to: patch.to ?? existingFilters.to,
  };
  const qs = serializeFilters(merged);
  return qs ? `${pathname}?${qs}` : pathname;
}

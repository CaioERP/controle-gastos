import { z } from 'zod';
import { PAYMENT_METHODS, REPORTABLE_KINDS, TX_KINDS, type PaymentMethod, type TxKind } from './enums';
import { monthEnd, monthStart, today } from './dates';

export const DIMENSIONS = [
  'category',
  'parentCategory',
  'paymentMethod',
  'institution',
  'account',
  'merchant',
  'tag',
  'kind',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD');

export const txFiltersSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    institutionIds: z.array(z.string().uuid()).optional(),
    accountIds: z.array(z.string().uuid()).optional(),
    kinds: z.array(z.enum(TX_KINDS)).optional(),
    paymentMethods: z.array(z.enum(PAYMENT_METHODS)).optional(),
    categoryIds: z.array(z.string().uuid()).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    merchantIds: z.array(z.string().uuid()).optional(),
    search: z.string().max(200).optional(),
    basis: z.enum(['accrual', 'cash']).optional(),
    includeProjected: z.boolean().optional(),
    needsReview: z.boolean().optional(),
  })
  .refine((f) => f.from <= f.to, { message: '"from" deve ser menor ou igual a "to"' });

export type TxFilters = z.infer<typeof txFiltersSchema>;

/** Mês corrente, natureza reportável, competência. */
export function defaultFilters(ref: string = today()): TxFilters {
  return { from: monthStart(ref), to: monthEnd(ref), kinds: [...REPORTABLE_KINDS] as TxKind[], basis: 'accrual' };
}

export type { PaymentMethod, TxKind };

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  CATEGORY_SOURCES,
  CONNECTION_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  SOURCES,
  TX_KINDS,
  TX_STATUSES,
} from '../domain/enums';

// ---------- enums ----------
export const accountTypeEnum = pgEnum('account_type', ACCOUNT_TYPES);
export const txKindEnum = pgEnum('tx_kind', TX_KINDS);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const txStatusEnum = pgEnum('tx_status', TX_STATUSES);
export const sourceEnum = pgEnum('source', SOURCES);
export const categorySourceEnum = pgEnum('category_source', CATEGORY_SOURCES);
export const invoiceStatusEnum = pgEnum('invoice_status', INVOICE_STATUSES);
export const connectionStatusEnum = pgEnum('connection_status', CONNECTION_STATUSES);
export const categoryKindEnum = pgEnum('category_kind', CATEGORY_KINDS);

// ---------- helpers ----------
const id = () => uuid('id').primaryKey().defaultRandom();
const money = (name: string) => bigint(name, { mode: 'number' });
const isoDate = (name: string) => date(name, { mode: 'string' });
const tstz = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = {
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
};

// ---------- tabelas ----------
export const institutions = pgTable('institutions', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  color: text('color').notNull(),
  pluggyConnectorId: integer('pluggy_connector_id'),
  ...timestamps,
});

export const connections = pgTable(
  'connections',
  {
    id: id(),
    provider: sourceEnum('provider').notNull(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    externalId: text('external_id').notNull(),
    status: connectionStatusEnum('status').notNull().default('pending'),
    consentExpiresAt: tstz('consent_expires_at'),
    lastSyncedAt: tstz('last_synced_at'),
    lastError: text('last_error'),
    ...timestamps,
  },
  (t) => [uniqueIndex('connections_provider_external_uq').on(t.provider, t.externalId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id),
    connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
    externalId: text('external_id'),
    type: accountTypeEnum('type').notNull(),
    name: text('name').notNull(),
    displayName: text('display_name'),
    currency: text('currency').notNull().default('BRL'),
    balanceCents: money('balance_cents').notNull().default(0),
    balanceUpdatedAt: tstz('balance_updated_at'),
    creditLimitCents: money('credit_limit_cents'),
    availableLimitCents: money('available_limit_cents'),
    closingDay: smallint('closing_day'),
    dueDay: smallint('due_day'),
    isHidden: boolean('is_hidden').notNull().default(false),
    includeInTotals: boolean('include_in_totals').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('accounts_connection_external_uq').on(t.connectionId, t.externalId)],
);

export const cards = pgTable(
  'cards',
  {
    id: id(),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    last4: text('last4').notNull(),
    brand: text('brand'),
    holderName: text('holder_name'),
    isVirtual: boolean('is_virtual').notNull().default(false),
    isAdditional: boolean('is_additional').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('cards_account_last4_uq').on(t.accountId, t.last4)],
);

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    referenceMonth: isoDate('reference_month').notNull(),
    closingDate: isoDate('closing_date').notNull(),
    dueDate: isoDate('due_date').notNull(),
    totalCents: money('total_cents').notNull().default(0),
    minimumPaymentCents: money('minimum_payment_cents'),
    status: invoiceStatusEnum('status').notNull().default('open'),
    paidAt: isoDate('paid_at'),
    paidAmountCents: money('paid_amount_cents'),
    externalId: text('external_id'),
    ...timestamps,
  },
  (t) => [uniqueIndex('invoices_account_month_uq').on(t.accountId, t.referenceMonth)],
);

export const categories = pgTable('categories', {
  id: id(),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  kind: categoryKindEnum('kind').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
  ...timestamps,
});

export const merchants = pgTable('merchants', {
  id: id(),
  name: text('name').notNull().unique(),
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
  defaultCategoryId: uuid('default_category_id').references(() => categories.id, { onDelete: 'set null' }),
  ...timestamps,
});

export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    date: isoDate('date').notNull(),
    amountCents: money('amount_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),
    descriptionRaw: text('description_raw').notNull(),
    description: text('description').notNull(),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
    providerCategoryId: text('provider_category_id'),
    kind: txKindEnum('kind').notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    status: txStatusEnum('status').notNull().default('posted'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    categorySource: categorySourceEnum('category_source').notNull().default('default'),
    categoryConfidence: real('category_confidence'),
    needsReview: boolean('needs_review').notNull().default(false),
    installmentGroupId: uuid('installment_group_id'),
    installmentNumber: smallint('installment_number'),
    installmentTotal: smallint('installment_total'),
    transferGroupId: uuid('transfer_group_id'),
    notes: text('notes'),
    userEditedFields: text('user_edited_fields').array().notNull().default(sql`'{}'::text[]`),
    deletedAt: tstz('deleted_at'),
    ...timestamps,
  },
  (t) => [
    index('transactions_account_date_idx').on(t.accountId, t.date),
    index('transactions_date_idx').on(t.date),
    index('transactions_category_idx').on(t.categoryId),
    index('transactions_installment_group_idx').on(t.installmentGroupId),
    index('transactions_invoice_idx').on(t.invoiceId),
  ],
);

export const transactionSources = pgTable(
  'transaction_sources',
  {
    id: id(),
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    source: sourceEnum('source').notNull(),
    externalId: text('external_id').notNull(),
    raw: jsonb('raw'),
    fetchedAt: tstz('fetched_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transaction_sources_source_external_uq').on(t.source, t.externalId),
    index('transaction_sources_transaction_idx').on(t.transactionId),
  ],
);

export const tags = pgTable('tags', {
  id: id(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  ...timestamps,
});

export const transactionTags = pgTable(
  'transaction_tags',
  {
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.transactionId, t.tagId] })],
);

export const categorizationRules = pgTable('categorization_rules', {
  id: id(),
  priority: integer('priority').notNull().default(0),
  matchField: text('match_field', { enum: ['description', 'merchant'] }).notNull(),
  matchType: text('match_type', { enum: ['contains', 'starts_with', 'equals', 'regex'] }).notNull(),
  pattern: text('pattern').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  amountMinCents: money('amount_min_cents'),
  amountMaxCents: money('amount_max_cents'),
  setCategoryId: uuid('set_category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  setKind: txKindEnum('set_kind'),
  setPaymentMethod: paymentMethodEnum('set_payment_method'),
  origin: text('origin', { enum: ['user', 'learned'] }).notNull().default('user'),
  hitCount: integer('hit_count').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  ...timestamps,
});

export const providerCategoryMap = pgTable(
  'provider_category_map',
  {
    id: id(),
    provider: sourceEnum('provider').notNull(),
    providerCategoryId: text('provider_category_id').notNull(),
    providerCategoryName: text('provider_category_name'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('provider_category_map_uq').on(t.provider, t.providerCategoryId)],
);

export const syncRuns = pgTable('sync_runs', {
  id: id(),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
  job: text('job').notNull(),
  startedAt: tstz('started_at').notNull().defaultNow(),
  finishedAt: tstz('finished_at'),
  status: text('status', { enum: ['running', 'success', 'error'] }).notNull().default('running'),
  stats: jsonb('stats').notNull().default({}),
  error: text('error'),
});

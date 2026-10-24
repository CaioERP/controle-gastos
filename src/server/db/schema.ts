import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
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
  ASSET_CLASSES,
  BENCHMARK_CODES,
  CATEGORY_KINDS,
  CATEGORY_SOURCES,
  CONNECTION_STATUSES,
  IMPORT_BATCH_STATUSES,
  INVESTMENT_INDEXERS,
  INVESTMENT_TX_TYPES,
  INVOICE_STATUSES,
  LIMIT_PERIODS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  PAYMENT_METHODS,
  PRICE_SOURCES,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_STATUSES,
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
export const importBatchStatusEnum = pgEnum('import_batch_status', IMPORT_BATCH_STATUSES);
export const assetClassEnum = pgEnum('asset_class', ASSET_CLASSES);
export const investmentIndexerEnum = pgEnum('investment_indexer', INVESTMENT_INDEXERS);
export const investmentTxTypeEnum = pgEnum('investment_tx_type', INVESTMENT_TX_TYPES);
export const benchmarkCodeEnum = pgEnum('benchmark_code', BENCHMARK_CODES);
export const priceSourceEnum = pgEnum('price_source', PRICE_SOURCES);
export const limitPeriodEnum = pgEnum('limit_period', LIMIT_PERIODS);
export const recurrenceFrequencyEnum = pgEnum('recurrence_frequency', RECURRENCE_FREQUENCIES);
export const recurrenceStatusEnum = pgEnum('recurrence_status', RECURRENCE_STATUSES);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const notificationChannelEnum = pgEnum('notification_channel', NOTIFICATION_CHANNELS);

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
    // Momento da transação quando a fonte informa a hora; null quando só há data. Filtros e totais usam `date`.
    occurredAt: tstz('occurred_at'),
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
    parentTransactionId: uuid('parent_transaction_id').references((): AnyPgColumn => transactions.id, {
      onDelete: 'cascade',
    }),
    notes: text('notes'),
    userEditedFields: text('user_edited_fields').array().notNull().default(sql`'{}'::text[]`),
    deletedAt: tstz('deleted_at'),
    ...timestamps,
  },
  (t) => [
    index('transactions_account_date_idx').on(t.accountId, t.date),
    index('transactions_date_idx').on(t.date),
    index('transactions_category_idx').on(t.categoryId),
    index('transactions_merchant_idx').on(t.merchantId),
    index('transactions_installment_group_idx').on(t.installmentGroupId),
    index('transactions_invoice_idx').on(t.invoiceId),
    index('transactions_parent_transaction_idx').on(t.parentTransactionId),
  ],
);

export const importBatches = pgTable(
  'import_batches',
  {
    id: id(),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    format: text('format').notNull(), // valores de IMPORT_FORMATS
    fileHash: text('file_hash').notNull(), // sha256 hex do conteúdo bruto
    status: importBatchStatusEnum('status').notNull().default('preview'),
    previewData: jsonb('preview_data').notNull().default({}),
    stats: jsonb('stats').notNull().default({}),
    ...timestamps,
  },
  (t) => [index('import_batches_account_status_idx').on(t.accountId, t.status)],
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
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, { onDelete: 'set null' }),
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

export const assets = pgTable(
  'assets',
  {
    id: id(),
    code: text('code').notNull().unique(),
    ticker: text('ticker'),
    isin: text('isin'),
    cnpj: text('cnpj'),
    name: text('name').notNull(),
    assetClass: assetClassEnum('asset_class').notNull(),
    currency: text('currency').notNull().default('BRL'),
    issuer: text('issuer'),
    indexer: investmentIndexerEnum('indexer'),
    rateBps: integer('rate_bps'),
    maturityDate: isoDate('maturity_date'),
    isTaxExempt: boolean('is_tax_exempt').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('assets_ticker_idx').on(t.ticker),
    index('assets_asset_class_idx').on(t.assetClass),
  ],
);

export const holdings = pgTable(
  'holdings',
  {
    id: id(),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'restrict' }),
    source: sourceEnum('source').notNull(),
    externalId: text('external_id').notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
    averagePriceCents: money('average_price_cents'),
    investedCents: money('invested_cents').notNull().default(0),
    currentValueCents: money('current_value_cents').notNull().default(0),
    netValueCents: money('net_value_cents'),
    profitCents: money('profit_cents'),
    asOfDate: isoDate('as_of_date').notNull(),
    isRedeemed: boolean('is_redeemed').notNull().default(false),
    userEditedFields: text('user_edited_fields').array().notNull().default(sql`'{}'::text[]`),
    raw: jsonb('raw'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('holdings_source_external_uq').on(t.source, t.externalId),
    index('holdings_account_idx').on(t.accountId),
    index('holdings_asset_idx').on(t.assetId),
  ],
);

export const investmentTransactions = pgTable(
  'investment_transactions',
  {
    id: id(),
    holdingId: uuid('holding_id').notNull().references(() => holdings.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    source: sourceEnum('source').notNull(),
    externalId: text('external_id').notNull(),
    type: investmentTxTypeEnum('type').notNull(),
    date: isoDate('date').notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 8 }),
    unitPriceCents: money('unit_price_cents'),
    amountCents: money('amount_cents').notNull(),
    feeCents: money('fee_cents').notNull().default(0),
    taxCents: money('tax_cents').notNull().default(0),
    description: text('description'),
    linkedTransactionId: uuid('linked_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    raw: jsonb('raw'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('investment_transactions_source_external_uq').on(t.source, t.externalId),
    index('investment_transactions_holding_date_idx').on(t.holdingId, t.date),
    index('investment_transactions_linked_tx_idx').on(t.linkedTransactionId),
  ],
);

export const assetPrices = pgTable(
  'asset_prices',
  {
    id: id(),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    date: isoDate('date').notNull(),
    priceCents: money('price_cents').notNull(),
    source: priceSourceEnum('source').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('asset_prices_asset_date_uq').on(t.assetId, t.date)],
);

export const benchmarkSeries = pgTable(
  'benchmark_series',
  {
    id: id(),
    benchmark: benchmarkCodeEnum('benchmark').notNull(),
    date: isoDate('date').notNull(),
    valueMicros: money('value_micros').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('benchmark_series_benchmark_date_uq').on(t.benchmark, t.date)],
);

export const netWorthSnapshots = pgTable(
  'net_worth_snapshots',
  {
    id: id(),
    date: isoDate('date').notNull().unique(),
    cashAccountsCents: money('cash_accounts_cents').notNull().default(0),
    investmentsCents: money('investments_cents').notNull().default(0),
    openInvoicesCents: money('open_invoices_cents').notNull().default(0),
    futureInstallmentsCents: money('future_installments_cents').notNull().default(0),
    assetsCents: money('assets_cents').notNull().default(0),
    liabilitiesCents: money('liabilities_cents').notNull().default(0),
    netWorthCents: money('net_worth_cents').notNull().default(0),
    breakdown: jsonb('breakdown'),
    ...timestamps,
  },
);

export const spendingLimits = pgTable(
  'spending_limits',
  {
    id: id(),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    paymentMethod: paymentMethodEnum('payment_method'),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    period: limitPeriodEnum('period').notNull().default('monthly'),
    amountCents: money('amount_cents').notNull(),
    thresholds: integer('thresholds').array().notNull().default(sql`'{80, 100}'`),
    notifyPace: boolean('notify_pace').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('spending_limits_category_idx').on(t.categoryId),
    index('spending_limits_payment_method_idx').on(t.paymentMethod),
    index('spending_limits_active_idx').on(t.isActive),
  ],
);

export const spendingLimitDispatches = pgTable(
  'spending_limit_dispatches',
  {
    id: id(),
    limitId: uuid('limit_id').notNull().references(() => spendingLimits.id, { onDelete: 'cascade' }),
    periodKey: text('period_key').notNull(),
    threshold: integer('threshold').notNull(),
    dispatchedAt: tstz('dispatched_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('limit_dispatch_uniq_idx').on(t.limitId, t.periodKey, t.threshold),
  ],
);

export const recurrences = pgTable(
  'recurrences',
  {
    id: id(),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    paymentMethod: paymentMethodEnum('payment_method'),
    frequency: recurrenceFrequencyEnum('frequency').notNull().default('monthly'),
    expectedDay: smallint('expected_day'),
    amountCents: money('amount_cents').notNull(),
    tolerancePercent: integer('tolerance_percent').notNull().default(10),
    status: recurrenceStatusEnum('status').notNull().default('active'),
    isSubscription: boolean('is_subscription').notNull().default(false),
    firstDate: isoDate('first_date').notNull(),
    lastDate: isoDate('last_date').notNull(),
    lastAmountCents: money('last_amount_cents').notNull(),
    autoDetected: boolean('auto_detected').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('recurrences_status_idx').on(t.status),
    index('recurrences_category_idx').on(t.categoryId),
    index('recurrences_merchant_idx').on(t.merchantId),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    actionUrl: text('action_url'),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    channel: notificationChannelEnum('channel').notNull().default('in_app'),
    readAt: tstz('read_at'),
    pushSentAt: tstz('push_sent_at'),
    fingerprint: text('fingerprint'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notifications_fingerprint_idx').on(t.fingerprint),
    index('notifications_read_created_idx').on(t.readAt, t.createdAt),
  ],
);

export const notificationPreferences = pgTable('notification_preferences', {
  id: id(),
  type: notificationTypeEnum('type').notNull().unique(),
  enabled: boolean('enabled').notNull().default(true),
  inApp: boolean('in_app').notNull().default(true),
  email: boolean('email').notNull().default(false),
  push: boolean('push').notNull().default(false),
  telegram: boolean('telegram').notNull().default(false),
  updatedAt: tstz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  deviceLabel: text('device_label'), // "iPhone", "Chrome no Windows" (vem do navegador)
  lastSuccessAt: tstz('last_success_at'),
  ...timestamps,
});



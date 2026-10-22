import type * as s from '../db/schema';

export type Institution = typeof s.institutions.$inferSelect;
export type Connection = typeof s.connections.$inferSelect;
export type Account = typeof s.accounts.$inferSelect;
export type Card = typeof s.cards.$inferSelect;
export type Invoice = typeof s.invoices.$inferSelect;
export type Category = typeof s.categories.$inferSelect;
export type Merchant = typeof s.merchants.$inferSelect;
export type Transaction = typeof s.transactions.$inferSelect;
export type NewTransaction = typeof s.transactions.$inferInsert;
export type Tag = typeof s.tags.$inferSelect;
export type CategorizationRule = typeof s.categorizationRules.$inferSelect;
export type SyncRun = typeof s.syncRuns.$inferSelect;
export type ImportBatch = typeof s.importBatches.$inferSelect;
export type Asset = typeof s.assets.$inferSelect;
export type Holding = typeof s.holdings.$inferSelect;
export type InvestmentTransactionRow = typeof s.investmentTransactions.$inferSelect;
export type AssetPrice = typeof s.assetPrices.$inferSelect;
export type BenchmarkSeriesRow = typeof s.benchmarkSeries.$inferSelect;
export type NetWorthSnapshot = typeof s.netWorthSnapshots.$inferSelect;
export type SpendingLimit = typeof s.spendingLimits.$inferSelect;
export type SpendingLimitDispatch = typeof s.spendingLimitDispatches.$inferSelect;
export type Recurrence = typeof s.recurrences.$inferSelect;
export type Notification = typeof s.notifications.$inferSelect;
export type NotificationPreference = typeof s.notificationPreferences.$inferSelect;
export type PushSubscription = typeof s.pushSubscriptions.$inferSelect;




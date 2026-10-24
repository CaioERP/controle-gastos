import { and, eq, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { accounts, transactions } from '@/server/db/schema';

/**
 * Exclui a transação "mãe" de uma divisão ativa (B2-03b): quem tem filhas não excluídas sai de totais e listas,
 * e as filhas entram no lugar.
 */
export const notSplitParent: SQL = sql`not exists (select 1 from ${transactions} child where child.parent_transaction_id = ${transactions.id} and child.deleted_at is null)`;

/**
 * Não apagada e não é mãe de uma divisão ativa (as filhas entram no lugar).
 * Base de tudo o que o usuário vê (listas, faturas, totais, detalhes).
 */
export const txLive: SQL = and(isNull(transactions.deletedAt), notSplitParent)!;

/**
 * txLive + status 'posted'.
 * Movimento que já aconteceu: saldo de contas, histórico de fluxo de caixa, detecção de recorrências.
 */
export const txPosted: SQL = and(txLive, eq(transactions.status, 'posted'))!;

/**
 * txLive + status diferente de 'projected'.
 * Transações que já existem (posted e pending): listas e totais do período.
 */
export const txNotProjected: SQL = and(txLive, ne(transactions.status, 'projected'))!;

/**
 * Conta visível (não oculta pelo usuário).
 * Exige join com accounts.
 */
export const accountVisible: SQL = eq(accounts.isHidden, false);

/**
 * Conta visível e incluída nos totais.
 * Exige join com accounts.
 */
export const accountInTotals: SQL = and(eq(accounts.isHidden, false), eq(accounts.includeInTotals, true))!;

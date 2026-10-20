import { sql, type SQL } from 'drizzle-orm';
import { transactions } from '@/server/db/schema';

/**
 * Exclui a transação "mãe" de uma divisão ativa (B2-03b): quem tem filhas não excluídas sai de totais e listas,
 * e as filhas entram no lugar. Use em toda consulta que soma ou lista transações.
 */
export const notSplitParent: SQL = sql`not exists (select 1 from ${transactions} child where child.parent_transaction_id = ${transactions.id} and child.deleted_at is null)`;

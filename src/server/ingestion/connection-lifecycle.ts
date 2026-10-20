import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { connections, syncRuns } from '@/server/db/schema';
import type { ConnectionStatus } from '@/server/domain/enums';

export const MAX_CONSECUTIVE_SYNC_ERRORS = 3;
export const CONSENT_WARNING_DAYS = 15;

export type ConnectionHealth = {
  consecutiveErrors: number;
  isPausedByErrors: boolean; // consecutiveErrors >= 3
  consentExpiringSoon: boolean; // expira em 1..15 dias
  consentDaysRemaining: number | null;
  consentExpired: boolean; // consentExpiresAt < now
  recommendedAction: string | null;
};

/**
 * Calcula a saúde da conexão a partir dos seus dados e das últimas execuções (ordenadas da mais recente para a mais antiga).
 */
export function evaluateConnectionHealth(
  conn: { status: ConnectionStatus; consentExpiresAt: Date | null; lastError: string | null },
  recentRuns: Array<{ status: string }>,
  now = new Date(),
): ConnectionHealth {
  let consecutiveErrors = 0;
  for (const run of recentRuns) {
    if (run.status === 'running') continue;
    if (run.status === 'error') {
      consecutiveErrors++;
    } else if (run.status === 'success') {
      break;
    }
  }

  const isPausedByErrors = consecutiveErrors >= MAX_CONSECUTIVE_SYNC_ERRORS;

  const consentDaysRemaining = conn.consentExpiresAt
    ? Math.ceil((conn.consentExpiresAt.getTime() - now.getTime()) / 86_400_000)
    : null;

  const consentExpired = consentDaysRemaining !== null && consentDaysRemaining <= 0;
  const consentExpiringSoon =
    consentDaysRemaining !== null &&
    consentDaysRemaining > 0 &&
    consentDaysRemaining <= CONSENT_WARNING_DAYS;

  let recommendedAction: string | null = null;
  if (conn.status === 'expired' || consentExpired) {
    recommendedAction =
      'O consentimento do Open Finance expirou. Clique em Reconectar para renovar o acesso.';
  } else if (conn.status === 'revoked') {
    recommendedAction =
      'O acesso foi revogado no banco. Clique em Reconectar para autorizar novamente.';
  } else if (isPausedByErrors) {
    recommendedAction =
      'Sincronização pausada após 3 falhas seguidas. Clique em Reconectar para atualizar suas credenciais no Meu Pluggy.';
  } else if (conn.status === 'error') {
    recommendedAction =
      'A última sincronização falhou. Tente sincronizar agora ou clique em Reconectar se o banco pediu nova autenticação.';
  } else if (consentExpiringSoon) {
    recommendedAction = `O consentimento expira em ${consentDaysRemaining} dias. Renove a conexão em breve para não interromper a sincronização.`;
  }

  return {
    consecutiveErrors,
    isPausedByErrors,
    consentExpiringSoon,
    consentDaysRemaining,
    consentExpired,
    recommendedAction,
  };
}

export async function checkConnectionsLifecycle(
  db: Db,
  now = new Date(),
): Promise<{
  checked: number;
  markedExpired: number;
  expiringSoon: number;
  pausedByErrors: number;
}> {
  const allConns = await db.select().from(connections);
  let markedExpired = 0;
  let expiringSoon = 0;
  let pausedByErrors = 0;

  for (const conn of allConns) {
    let currentStatus = conn.status;

    if (
      conn.consentExpiresAt &&
      conn.consentExpiresAt.getTime() <= now.getTime() &&
      conn.status !== 'expired' &&
      conn.status !== 'revoked'
    ) {
      await db
        .update(connections)
        .set({
          status: 'expired',
          lastError: 'Consentimento Open Finance expirado',
          updatedAt: now,
        })
        .where(eq(connections.id, conn.id));
      currentStatus = 'expired';
      markedExpired++;
    }

    const recentRuns = await db
      .select({ status: syncRuns.status })
      .from(syncRuns)
      .where(eq(syncRuns.connectionId, conn.id))
      .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
      .limit(5);

    const health = evaluateConnectionHealth(
      {
        status: currentStatus,
        consentExpiresAt: conn.consentExpiresAt,
        lastError: conn.lastError,
      },
      recentRuns,
      now,
    );

    if (health.consentExpiringSoon) {
      expiringSoon++;
    }
    if (health.isPausedByErrors) {
      pausedByErrors++;
    }
  }

  return {
    checked: allConns.length,
    markedExpired,
    expiringSoon,
    pausedByErrors,
  };
}

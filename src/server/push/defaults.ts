import type { NotificationType } from '@/server/domain/enums';

export const DEFAULT_PUSH_TYPES: ReadonlySet<NotificationType> = new Set([
  'threshold_100',
  'sync_error',
  'consent_expiring',
]);

export function pushEnabledFor(
  type: NotificationType,
  stored?: { enabled: boolean; push: boolean },
): boolean {
  if (!stored) return DEFAULT_PUSH_TYPES.has(type);
  return stored.enabled && stored.push;
}

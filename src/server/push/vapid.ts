import webpush from 'web-push';
import { env } from '@/lib/env';

export function pushConfigured(): boolean {
  return Boolean(
    env.VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY &&
    env.VAPID_SUBJECT,
  );
}

export function getVapidPublicKey(): string | null {
  return env.VAPID_PUBLIC_KEY ?? null;
}

let vapidDetailsConfigured = false;

export function ensureVapidConfigured(): boolean {
  if (!pushConfigured()) return false;
  if (!vapidDetailsConfigured) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT!,
      env.VAPID_PUBLIC_KEY!,
      env.VAPID_PRIVATE_KEY!,
    );
    vapidDetailsConfigured = true;
  }
  return true;
}

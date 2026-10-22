'use server';

import { getDb } from '@/server/db/client';
import {
  deletePushSubscription,
  savePushSubscription,
  sendTestPush,
  type SavePushSubscriptionInput,
} from '@/server/commands/push';
import { runAction } from '@/lib/action';

export async function subscribePush(input: SavePushSubscriptionInput) {
  return runAction(() => savePushSubscription(getDb(), input));
}

export async function unsubscribePush(endpoint: string) {
  return runAction(() => deletePushSubscription(getDb(), endpoint));
}

export async function testPush() {
  return runAction(() => sendTestPush(getDb()));
}

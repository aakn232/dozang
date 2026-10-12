import { env } from 'cloudflare:workers';
import type { VapidKeys } from '@block65/webcrypto-web-push';
import { getDb } from '../db';
import { drainPush } from './push-queue';
import { afterPushResponse } from './push-context';
export function pushKeys():VapidKeys|null {
  const e=env as unknown as Record<string,string|undefined>;
  return e.PUSH_VAPID_PUBLIC_KEY&&e.PUSH_VAPID_PRIVATE_KEY?{publicKey:e.PUSH_VAPID_PUBLIC_KEY,privateKey:e.PUSH_VAPID_PRIVATE_KEY,subject:'https://dozang-aakn232.foggygiant.chatgpt.site'}:null;
}
export async function dispatchPhoneNotifications():Promise<void> {
  const keys=pushKeys();if(keys)await afterPushResponse(drainPush(getDb(),keys));
}

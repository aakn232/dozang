import { env } from 'cloudflare:workers';
export function getDb() {
  if (!env.DB) throw new Error('Stamp database unavailable');
  return env.DB;
}

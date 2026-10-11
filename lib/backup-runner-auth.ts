import { env } from 'cloudflare:workers';

export function backupSettings() {
  const e = env as unknown as Record<string, string | undefined>;
  return { key: e.DOZANG_BACKUP_KEY, siteAccess: e.DOZANG_BACKUP_SITE_ACCESS, ownerEmail: e.DOZANG_BACKUP_OWNER_EMAIL };
}

export async function isBackupRunner(request: Request): Promise<boolean> {
  const expected = backupSettings().key, supplied = request.headers.get('x-dozang-backup-key');
  if (!expected || expected.length < 32 || !supplied || supplied.length > 256) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a,b] = await Promise.all([digest(expected), digest(supplied)]);
  let difference = 0;
  for (let i=0; i<a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

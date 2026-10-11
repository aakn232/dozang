import { getDb } from '../db';
import type { BackupRecord } from './backup-format';
type Db = ReturnType<typeof getDb>;
export type ArchiveRecord = BackupRecord & { revision:string; notion_page_id:string|null; backed_up_revision:string|null; backed_up_at:string|null };
export function newTicket() { return crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''); }
export function snapshot(db: Db, id: string, revision: string) {
  return id.startsWith('legacy:')
    ? db.prepare("INSERT INTO stamp_archive (id,board,day,created_at,content,revision) SELECT 'legacy:' || rowid,'first',day,created_at,'',? FROM attendance WHERE rowid=CAST(? AS INTEGER) ON CONFLICT(id) DO NOTHING").bind(revision,id.slice(7))
    : db.prepare('INSERT INTO stamp_archive (id,board,day,created_at,content,revision) SELECT id,board,day,created_at,content,? FROM praise_stamps WHERE id=? ON CONFLICT(id) DO NOTHING').bind(revision,id);
}
export function queue(db: Db, id: string, revision: string | null, now = new Date().toISOString()) {
  return db.prepare(`INSERT INTO backup_jobs (id,revision,ticket,queued_at)
    SELECT id,revision,?,? FROM stamp_archive WHERE id=? AND (? IS NULL OR revision=?) AND backed_up_revision IS NOT revision
    ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,ticket=excluded.ticket,queued_at=excluded.queued_at,last_error=NULL
    WHERE backup_jobs.revision <> excluded.revision`).bind(newTicket(),now,id,revision,revision);
}
export async function backfill() {
  const db=getDb();
  const rows=await db.prepare(`SELECT id FROM praise_stamps WHERE id NOT IN (SELECT id FROM stamp_archive)
    UNION ALL SELECT 'legacy:' || rowid AS id FROM attendance WHERE 'legacy:' || rowid NOT IN (SELECT id FROM stamp_archive) LIMIT 40`).all<{id:string}>();
  for(const {id} of rows.results) await db.batch([snapshot(db,id,crypto.randomUUID()),queue(db,id,null)]);
  return rows.results.length;
}
export function insertLive(db: Db, r: BackupRecord) {
  return r.id.startsWith('legacy:')
    ? db.prepare('INSERT OR IGNORE INTO attendance (rowid,user_id,day,created_at) VALUES (CAST(? AS INTEGER),?,?,?)').bind(r.id.slice(7),'restored:'+r.id,r.day,r.created_at)
    : db.prepare('INSERT OR IGNORE INTO praise_stamps (id,user_id,board,day,created_at,content) VALUES (?,?,?,?,?,?)').bind(r.id,'shared-board',r.board,r.day,r.created_at,r.content);
}

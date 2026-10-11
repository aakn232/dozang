import { getDb } from '../../../../db';
import { deletionPassword, isBoardId } from '../../../../lib/stamps';
import { isSameOrigin } from '../../../../lib/request-origin';
import { backupRecord, readBundle, validStampId } from '../../../../lib/backup-format';
import { backfill, insertLive, queue, type ArchiveRecord } from '../../../../lib/backup-store';

export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request) {
  if(!isSameOrigin(request))return reply({error:'허용되지 않은 요청입니다.'},403);
  let body:{password?:unknown;action?:unknown;board?:unknown;id?:unknown;bundle?:unknown};
  try {const text=await request.text();if(text.length>12_000_000)return reply({error:'백업 파일이 너무 큽니다.'},413);body=JSON.parse(text);}catch{return reply({error:'잘못된 요청입니다.'},400);}
  if(!body||body.password!==deletionPassword())return reply({error:'오늘의 비밀번호를 다시 확인해 주세요.'},403);
  const board=body.board;
  if(!isBoardId(board))return reply({error:'도장판을 확인해 주세요.'},400);
  const db=getDb();
  try {
    if(body.action==='backfill')return reply({queued:await backfill()});
    if(body.action==='status') {
      const [stats,deleted]=await db.batch([
        db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN a.revision=a.backed_up_revision THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN j.id IS NOT NULL THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN j.last_error IS NOT NULL THEN 1 ELSE 0 END) AS failed, MAX(a.backed_up_at) AS last_success,
          MIN(j.queued_at) AS oldest_pending FROM stamp_archive a LEFT JOIN backup_jobs j ON a.id=j.id WHERE a.board=?`).bind(board),
        db.prepare('SELECT id,day,content,deleted_at FROM stamp_archive WHERE board=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100').bind(board),
      ]);
      return reply({stats:stats.results[0],deleted:deleted.results});
    }
    if(body.action==='export') {
      const rows=await db.prepare('SELECT * FROM stamp_archive WHERE board=? ORDER BY day,created_at,id').bind(board).all<ArchiveRecord>();
      return reply({format:'dozang-backup',schema_version:1,exported_at:new Date().toISOString(),records:rows.results.map(backupRecord)});
    }
    if(body.action==='restore'&&validStampId(body.id)) {
      const row=await db.prepare('SELECT * FROM stamp_archive WHERE id=? AND board=? AND deleted_at IS NOT NULL').bind(body.id,board).first<ArchiveRecord>();
      if(!row)return reply({error:'복원할 도장을 찾지 못했습니다.'},404);
      const revision=crypto.randomUUID(), r=backupRecord(row);
      const existing=r.id.startsWith('legacy:')
        ? await db.prepare('SELECT rowid FROM attendance WHERE rowid=CAST(? AS INTEGER)').bind(r.id.slice(7)).first()
        : await db.prepare('SELECT id FROM praise_stamps WHERE id=?').bind(r.id).first();
      if(existing)return reply({error:'이미 같은 번호의 기록이 있어 덮어쓰지 않았습니다.'},409);
      await db.batch([insertLive(db,r),db.prepare('UPDATE stamp_archive SET deleted_at=NULL,revision=? WHERE id=? AND board=?').bind(revision,r.id,board),queue(db,r.id,revision)]);
      return reply({restoredId:r.id});
    }
    if(body.action==='preview-import'||body.action==='import') {
      let bundle;
      try {bundle=readBundle(body.bundle);}catch(error){return reply({error:(error as Error).message},400);}
      if(bundle.records.some(r=>r.board!==board))return reply({error:'선택한 도장판의 백업 파일만 복원할 수 있습니다.'},400);
      const existing=await db.prepare("SELECT id FROM stamp_archive UNION SELECT id FROM praise_stamps UNION SELECT 'legacy:' || rowid AS id FROM attendance").all<{id:string}>();
      const ids=new Set(existing.results.map(r=>r.id)), missing=bundle.records.filter(r=>!ids.has(r.id));
      if(body.action==='preview-import')return reply({missing:missing.length,skipped:bundle.records.length-missing.length,deleted:missing.filter(r=>r.deleted_at).length});
      let imported=0;
      for(const r of missing) {
        const revision=crypto.randomUUID();
        // Recheck inside the atomic batch; imported data never replaces a current record.
        const statements=[db.prepare(`INSERT OR IGNORE INTO stamp_archive (id,board,day,created_at,content,deleted_at,revision)
          SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM praise_stamps WHERE id=?) AND NOT EXISTS (SELECT 1 FROM attendance WHERE 'legacy:' || rowid=?)`).bind(r.id,r.board,r.day,r.created_at,r.content,r.deleted_at,revision,r.id,r.id)];
        if(!r.deleted_at) statements.push(r.id.startsWith('legacy:')
          ? db.prepare("INSERT OR IGNORE INTO attendance (rowid,user_id,day,created_at) SELECT CAST(substr(id,8) AS INTEGER),'restored:' || id,day,created_at FROM stamp_archive WHERE id=? AND revision=?").bind(r.id,revision)
          : db.prepare("INSERT OR IGNORE INTO praise_stamps (id,user_id,board,day,created_at,content) SELECT id,'shared-board',board,day,created_at,content FROM stamp_archive WHERE id=? AND revision=?").bind(r.id,revision));
        statements.push(queue(db,r.id,revision));
        const result=await db.batch(statements);imported+=result[0].meta.changes;
      }
      return reply({imported,skipped:bundle.records.length-imported});
    }
    return reply({error:'지원하지 않는 작업입니다.'},400);
  } catch {return reply({error:'백업 작업을 처리하지 못했습니다. 다시 시도해 주세요.'},503);}
}

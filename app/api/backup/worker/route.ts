import { getDb } from '../../../../db';
import { backupRecord, notionContent } from '../../../../lib/backup-format';
import type { ArchiveRecord } from '../../../../lib/backup-store';
import { isBackupRunner } from '../../../../lib/backup-runner-auth';
import { newTicket } from '../../../../lib/backup-store';

export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const NOTION_UUID=/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

// Unattended access uses a random per-job ticket fetched through owner-authorized Sites D1 tools.
// Tickets are never available from public stamp APIs, backup status, exports, or client code.
export async function POST(request:Request) {
  if(request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'허용되지 않은 요청입니다.'},403);
  let body:{id?:unknown;ticket?:unknown;action?:unknown;lease?:unknown;page_id?:unknown;hash?:unknown;error?:unknown;after?:unknown;completed?:unknown;failed?:unknown};
  try { body=await request.json(); } catch {return reply({error:'잘못된 요청입니다.'},400);}
  if(body && (body.action==='list' || body.action==='report' || body.action==='resync')) {
    if(!await isBackupRunner(request))return reply({error:'인증 실패'},401);
    const db=getDb();
    if(body.action==='resync') {
      if(body.after!==undefined && (typeof body.after!=='string'||body.after.length>100))return reply({error:'잘못된 커서'},400);
      const rows=await db.prepare('SELECT id,revision FROM stamp_archive WHERE id>? ORDER BY id LIMIT 26').bind(body.after||'').all<{id:string;revision:string}>();
      const page=rows.results.slice(0,25),now=new Date().toISOString();
      // Recheck retained snapshots without changing their revision, content or prior backup receipt.
      // Existing queued/leased work remains untouched.
      const results=page.length?await db.batch(page.map(r=>db.prepare(`INSERT OR IGNORE INTO backup_jobs (id,revision,ticket,queued_at)
        SELECT id,revision,?,? FROM stamp_archive WHERE id=? AND revision=?`).bind(newTicket(),now,r.id,r.revision))):[];
      return reply({queued:results.reduce((n,r)=>n+(r.meta.changes||0),0),next_cursor:rows.results.length>25?page[24].id:null});
    }
    if(body.action==='list') {
      if(body.after!==undefined && (typeof body.after!=='string'||body.after.length>100))return reply({error:'잘못된 커서'},400);
      const rows=await db.prepare('SELECT id,revision,ticket,lease_until FROM backup_jobs WHERE id>? ORDER BY id LIMIT 26').bind(body.after||'').all();
      return reply({jobs:rows.results.slice(0,25),next_cursor:rows.results.length>25?rows.results[24].id:null});
    }
    if(!Number.isSafeInteger(body.completed)||!Number.isSafeInteger(body.failed)||Number(body.completed)<0||Number(body.failed)<0)return reply({error:'잘못된 실행 결과'},400);
    const now=new Date().toISOString();
    await db.prepare(`INSERT INTO backup_runner_status (id,last_run_at,completed,failed) VALUES (1,?,?,?)
      ON CONFLICT(id) DO UPDATE SET last_run_at=excluded.last_run_at,completed=excluded.completed,failed=excluded.failed`).bind(now,body.completed,body.failed).run();
    return reply({recorded_at:now});
  }
  if(!body||typeof body.id!=='string'||typeof body.ticket!=='string'||!/^[a-f0-9]{64}$/.test(body.ticket))return reply({error:'인증 실패'},401);
  const db=getDb(), now=new Date().toISOString();
  try {
    if(body.action==='claim') {
      const lease=crypto.randomUUID(), until=new Date(Date.now()+15*60_000).toISOString();
      const result=await db.prepare('UPDATE backup_jobs SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND ticket=? AND (lease_until IS NULL OR lease_until<=?)').bind(lease,until,body.id,body.ticket,now).run();
      if(!result.meta.changes)return reply({error:'작업이 이미 처리 중이거나 변경되었습니다.'},409);
      const row=await db.prepare('SELECT a.* FROM stamp_archive a JOIN backup_jobs j ON a.id=j.id AND a.revision=j.revision WHERE j.id=? AND j.ticket=? AND j.lease_token=?').bind(body.id,body.ticket,lease).first<ArchiveRecord>();
      if(!row)return reply({error:'작업이 변경되었습니다.'},409);
      const record=backupRecord(row), rendered=await notionContent(record);
      return reply({lease,revision:row.revision,notion_page_id:row.notion_page_id,record,...rendered});
    }
    if(typeof body.lease!=='string')return reply({error:'인증 실패'},401);
    const job=await db.prepare('SELECT revision FROM backup_jobs WHERE id=? AND ticket=? AND lease_token=? AND lease_until>?').bind(body.id,body.ticket,body.lease,now).first<{revision:string}>();
    if(!job)return reply({error:'작업이 변경되었거나 인증이 만료되었습니다.'},409);
    if(body.action==='fail') {
      await db.prepare('UPDATE backup_jobs SET last_error=?,lease_token=NULL,lease_until=NULL WHERE id=? AND ticket=? AND lease_token=?').bind(typeof body.error==='string'?body.error.slice(0,200):'Notion 백업 실패',body.id,body.ticket,body.lease).run();
      return reply({retry:true});
    }
    if(body.action!=='ack'||typeof body.page_id!=='string'||!NOTION_UUID.test(body.page_id)||typeof body.hash!=='string')return reply({error:'잘못된 완료 요청입니다.'},400);
    const row=await db.prepare('SELECT * FROM stamp_archive WHERE id=? AND revision=?').bind(body.id,job.revision).first<ArchiveRecord>();
    if(!row)return reply({error:'기록이 변경되었습니다.'},409);
    if((await notionContent(backupRecord(row))).hash!==body.hash)return reply({error:'원문 검증 실패'},400);
    const result=await db.batch([
      db.prepare(`UPDATE stamp_archive SET notion_page_id=?,backed_up_revision=revision,backed_up_at=? WHERE id=? AND revision=?
        AND EXISTS (SELECT 1 FROM backup_jobs WHERE id=? AND ticket=? AND lease_token=? AND lease_until>?)`).bind(body.page_id,now,body.id,job.revision,body.id,body.ticket,body.lease,now),
      db.prepare('DELETE FROM backup_jobs WHERE id=? AND ticket=? AND lease_token=? AND EXISTS (SELECT 1 FROM stamp_archive WHERE id=? AND revision=backed_up_revision)').bind(body.id,body.ticket,body.lease,body.id),
    ]);
    if(!result[0].meta.changes)return reply({error:'기록이 변경되었습니다.'},409);
    return reply({backed_up_at:now});
  } catch { return reply({error:'백업 작업을 처리하지 못했습니다.'},503); }
}

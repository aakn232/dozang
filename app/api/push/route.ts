import { getDb } from '../../../db';
import { isSameOrigin } from '../../../lib/request-origin';
import { isBoardId } from '../../../lib/stamps';
import { deviceSubscription, subscriptionId, notificationData } from '../../../lib/push-format';
import { pushKeys, dispatchPhoneNotifications } from '../../../lib/push-server';
import { sendPhonePush, type PushDevice } from '../../../lib/push-queue';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const flags=(r:PushDevice|null)=>({first:!!r?.first_enabled,second:!!r?.second_enabled});
export async function GET(request:Request) {
  if(request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'허용되지 않은 요청입니다.'},403);
  const keys=pushKeys();return reply({configured:!!keys,publicKey:keys?.publicKey||null});
}
export async function POST(request:Request) {
  if(!isSameOrigin(request))return reply({error:'허용되지 않은 요청입니다.'},403);
  let body:{action?:unknown;board?:unknown;subscription?:unknown};
  try {const text=await request.text();if(text.length>6000)return reply({error:'연결 정보가 너무 큽니다.'},413);body=JSON.parse(text);}catch{return reply({error:'잘못된 요청입니다.'},400);}
  let subscription;
  try {subscription=deviceSubscription(body?.subscription);}catch{return reply({error:'알림 연결 정보가 올바르지 않습니다.'},400);}
  if(!['status','subscribe','disable','test'].includes(String(body.action))||!isBoardId(body.board))return reply({error:'도장판과 알림 설정을 확인해 주세요.'},400);
  const board=body.board,db=getDb(),id=await subscriptionId(subscription),now=new Date().toISOString();
  try {
    let row=await db.prepare('SELECT * FROM push_subscriptions WHERE id=?').bind(id).first<PushDevice>();
    if(row&&(row.p256dh!==subscription.keys.p256dh||row.auth!==subscription.keys.auth))return reply({error:'브라우저의 알림 연결을 다시 확인해 주세요.'},403);
    if(body.action==='status')return reply({enabled:flags(row)});
    if(body.action==='disable') {
      if(row){
        const column=board==='first'?'first_enabled':'second_enabled';
        await db.batch([
          db.prepare(`UPDATE push_subscriptions SET ${column}=0,updated_at=? WHERE id=?`).bind(now,id),
          db.prepare('DELETE FROM push_deliveries WHERE subscription_id=? AND stamp_id IN (SELECT stamp_id FROM push_events WHERE board=?) AND sent_at IS NULL').bind(id,board),
        ]);
        row=await db.prepare('SELECT * FROM push_subscriptions WHERE id=?').bind(id).first<PushDevice>();
        if(row&&!row.first_enabled&&!row.second_enabled){
          await db.batch([
            db.prepare('DELETE FROM push_deliveries WHERE subscription_id=? AND EXISTS (SELECT 1 FROM push_subscriptions WHERE id=? AND first_enabled=0 AND second_enabled=0)').bind(id,id),
            db.prepare('DELETE FROM push_subscriptions WHERE id=? AND first_enabled=0 AND second_enabled=0').bind(id),
          ]);
          row=await db.prepare('SELECT * FROM push_subscriptions WHERE id=?').bind(id).first<PushDevice>();
        }
      }
      return reply({enabled:flags(row)});
    }
    const keys=pushKeys();if(!keys)return reply({error:'알림 연결을 준비 중이에요. 잠시 후 다시 시도해 주세요.'},503);
    if(body.action==='subscribe') {
      if(!row){const count=await db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').first<{count:number}>();if((count?.count||0)>=200)return reply({error:'현재 알림 연결이 많아요. 잠시 후 다시 시도해 주세요.'},503);}
      const first=board==='first'?1:0,second=board==='second'?1:0,column=board==='first'?'first_enabled':'second_enabled';
      await db.prepare(`INSERT INTO push_subscriptions (id,endpoint,p256dh,auth,first_enabled,second_enabled,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ${column}=1,updated_at=excluded.updated_at`).bind(id,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,first,second,now,now).run();
      row=await db.prepare('SELECT * FROM push_subscriptions WHERE id=?').bind(id).first<PushDevice>();
      await dispatchPhoneNotifications();return reply({enabled:flags(row)});
    }
    if(!row||!row[board==='first'?'first_enabled':'second_enabled'])return reply({error:'이 도장판의 알림을 먼저 켜 주세요.'},400);
    const cutoff=new Date(Date.now()-60000).toISOString();
    const result=await db.prepare('UPDATE push_subscriptions SET last_test_at=? WHERE id=? AND (last_test_at IS NULL OR last_test_at<=?)').bind(now,id,cutoff).run();
    if(!result.meta.changes)return reply({error:'테스트 알림은 1분 뒤에 다시 보낼 수 있어요.'},429);
    const status=await sendPhonePush(row,notificationData(board,crypto.randomUUID(),true),keys,300);
    if(status===404||status===410){await db.batch([db.prepare('DELETE FROM push_deliveries WHERE subscription_id=?').bind(id),db.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(id)]);return reply({error:'알림 연결이 만료됐어요. 알림을 다시 켜 주세요.'},410);}
    if(status<200||status>=300)return reply({error:'테스트 알림을 보내지 못했어요. 잠시 후 다시 시도해 주세요.'},503);
    return reply({accepted:true});
  }catch{return reply({error:'알림 설정을 처리하지 못했어요. 다시 시도해 주세요.'},503);}
}

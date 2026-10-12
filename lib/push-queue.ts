import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push';
import { notificationData, type DeviceSubscription } from './push-format.ts';
import type { BoardId } from './stamps.ts';
export type PushDb=Pick<D1Database,'prepare'|'batch'>;
export type PushDevice={id:string;endpoint:string;p256dh:string;auth:string;first_enabled:number;second_enabled:number};
type Delivery=PushDevice&{stamp_id:string;board:BoardId;attempts:number;expires_at:string};

export function pushEventStatements(db:PushDb,id:string,board:BoardId,now:string) {
  const expires=new Date(Date.parse(now)+24*60*60*1000).toISOString();
  return [
    db.prepare(`INSERT OR IGNORE INTO push_events (stamp_id,board,created_at,expires_at)
      SELECT id,board,created_at,? FROM praise_stamps WHERE id=? AND board=? AND created_at=?`).bind(expires,id,board,now),
    db.prepare(`INSERT OR IGNORE INTO push_deliveries (stamp_id,subscription_id,next_attempt_at)
      SELECT e.stamp_id,s.id,e.created_at FROM push_events e JOIN push_subscriptions s ON
        ((e.board='first' AND s.first_enabled=1) OR (e.board='second' AND s.second_enabled=1))
      WHERE e.stamp_id=? AND e.created_at=?`).bind(id,now),
  ];
}
export async function sendPhonePush(device:PushDevice,data:ReturnType<typeof notificationData>,vapid:VapidKeys,ttl=86400):Promise<number> {
  const subscription:DeviceSubscription={endpoint:device.endpoint,expirationTime:null,keys:{p256dh:device.p256dh,auth:device.auth}};
  const payload=await buildPushPayload({data:JSON.stringify(data),options:{ttl}},subscription,vapid);
  const response=await fetch(device.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(8000)});
  // Never log provider bodies, endpoint URLs, keys or message content.
  await response.arrayBuffer();return response.status;
}
export async function drainPush(db:PushDb,vapid:VapidKeys,options:{send?:typeof sendPhonePush;now?:()=>Date;limit?:number}={}) {
  const clock=options.now||(()=>new Date()),send=options.send||sendPhonePush,now=clock().toISOString();
  const result={accepted:0,failed:0,removed:0,deferred:0};
  await db.batch([
    db.prepare('DELETE FROM push_deliveries WHERE stamp_id IN (SELECT stamp_id FROM push_events WHERE expires_at<=?)').bind(now),
    db.prepare('DELETE FROM push_events WHERE expires_at<=?').bind(now),
  ]);
  const rows=await db.prepare(`SELECT d.stamp_id,d.attempts,e.board,e.expires_at,s.* FROM push_deliveries d
    JOIN push_events e ON e.stamp_id=d.stamp_id JOIN push_subscriptions s ON s.id=d.subscription_id
    WHERE d.sent_at IS NULL AND d.next_attempt_at<=? AND (d.lease_until IS NULL OR d.lease_until<=?)
    ORDER BY d.next_attempt_at LIMIT ?`).bind(now,now,options.limit||12).all<Delivery>();
  async function deliver(row:Delivery) {
    const lease=crypto.randomUUID(),until=new Date(clock().getTime()+120000).toISOString();
    const claimed=await db.prepare(`UPDATE push_deliveries SET lease_token=?,lease_until=?,attempts=attempts+1
      WHERE stamp_id=? AND subscription_id=? AND sent_at IS NULL AND next_attempt_at<=?
        AND (lease_until IS NULL OR lease_until<=?)`).bind(lease,until,row.stamp_id,row.id,now,now).run();
    if(!claimed.meta.changes){result.deferred++;return;}
    const device=await db.prepare('SELECT * FROM push_subscriptions WHERE id=?').bind(row.id).first<PushDevice>();
    const live=await db.prepare('SELECT id FROM praise_stamps WHERE id=?').bind(row.stamp_id).first();
    if(!device||!device[row.board==='first'?'first_enabled':'second_enabled']||!live) {
      await db.prepare('UPDATE push_deliveries SET sent_at=?,last_error=?,lease_token=NULL,lease_until=NULL WHERE stamp_id=? AND subscription_id=? AND lease_token=?').bind(clock().toISOString(),'cancelled',row.stamp_id,row.id,lease).run();return;
    }
    let status=0;
    try{status=await send(device,notificationData(row.board,row.stamp_id),vapid,Math.max(1,Math.floor((Date.parse(row.expires_at)-clock().getTime())/1000)));}catch{/* Retry without exposing keys or provider details. */}
    if(status===404||status===410) {
      await db.batch([db.prepare('DELETE FROM push_deliveries WHERE subscription_id=?').bind(row.id),db.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(row.id)]);result.removed++;return;
    }
    if(status>=200&&status<300) {
      await db.prepare('UPDATE push_deliveries SET sent_at=?,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE stamp_id=? AND subscription_id=? AND lease_token=?').bind(clock().toISOString(),row.stamp_id,row.id,lease).run();result.accepted++;return;
    }
    const delay=Math.min(3600000,60000*2**Math.min(row.attempts,6));
    await db.prepare('UPDATE push_deliveries SET next_attempt_at=?,last_error=?,lease_token=NULL,lease_until=NULL WHERE stamp_id=? AND subscription_id=? AND lease_token=?').bind(new Date(clock().getTime()+delay).toISOString(),status?`provider HTTP ${status}`:'network failure',row.stamp_id,row.id,lease).run();result.failed++;
  }
  // Four bounded requests at a time fit the Workers post-response execution window.
  for(let i=0;i<rows.results.length;i+=4)await Promise.all(rows.results.slice(i,i+4).map(deliver));
  const pending=await db.prepare('SELECT COUNT(*) AS count FROM push_deliveries WHERE sent_at IS NULL').first<{count:number}>();
  return {...result,pending:pending?.count||0};
}

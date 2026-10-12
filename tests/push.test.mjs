import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createECDH,randomBytes,createHmac,createDecipheriv} from 'node:crypto';
import {buildPushPayload} from '@block65/webcrypto-web-push';
import {runInNewContext} from 'node:vm';
import {deviceSubscription,allowedPushEndpoint,notificationData} from '../lib/push-format.ts';
import {pushEventStatements,drainPush} from '../lib/push-queue.ts';

const migration=await readFile(new URL('../drizzle/0006_narrow_talkback.sql',import.meta.url),'utf8');
const NOW='2026-10-12T12:00:00.000Z',vapid={subject:'https://example.test',publicKey:'test',privateKey:'test'};
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec(migration);sql.exec('CREATE TABLE praise_stamps (id TEXT PRIMARY KEY,board TEXT,created_at TEXT)');
 function prepare(query,args=[]){return {bind(...next){return prepare(query,next)},run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}}},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null}};}
 const db={prepare,async batch(statements){sql.exec('BEGIN');try{const r=statements.map(s=>s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 function device(id,first,second){sql.prepare('INSERT INTO push_subscriptions (id,endpoint,p256dh,auth,first_enabled,second_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id,'https://fcm.googleapis.com/fcm/send/'+id,'key','auth',first,second,NOW,NOW);}
 async function stamp(id,board){sql.prepare('INSERT INTO praise_stamps VALUES (?,?,?)').run(id,board,NOW);await db.batch(pushEventStatements(db,id,board,NOW));}
 return {sql,db,device,stamp};
}
test('subscription validation permits real push providers and rejects arbitrary/private/credential URLs',()=>{
 const c=createECDH('prime256v1');c.generateKeys();const s={endpoint:'https://web.push.apple.com/test',keys:{p256dh:c.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
 assert.equal(deviceSubscription(s).endpoint,s.endpoint);
 for(const url of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://evil.test/a','https://user:password@web.push.apple.com/a','https://web.push.apple.com:8443/a'])assert.equal(allowedPushEndpoint(url),false,url);
 assert.throws(()=>deviceSubscription({...s,keys:{...s.keys,auth:'bad'}}));
});
test('encrypted push is decryptable by the recipient and VAPID signature verifies with the public key',async()=>{
 const receiver=createECDH('prime256v1');receiver.generateKeys();const signer=createECDH('prime256v1');signer.generateKeys();
 const auth=randomBytes(16),pub=signer.getPublicKey(),privateKey=Buffer.concat([Buffer.alloc(32-signer.getPrivateKey().length),signer.getPrivateKey()]);
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',expirationTime:null,keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}};
 const data=notificationData('second','12345678-1234-4123-8123-123456789abc');
 const request=await buildPushPayload({data:JSON.stringify(data),options:{ttl:300}},sub,{subject:'https://example.test',publicKey:pub.toString('base64url'),privateKey:privateKey.toString('base64url')});
 const body=Buffer.from(request.body);assert.equal(body.length,4096);assert.equal(request.headers['content-encoding'],'aes128gcm');
 const salt=body.subarray(0,16),size=body.readUInt32BE(16),length=body[20],sender=body.subarray(21,21+length),ciphertext=body.subarray(21+length);
 assert.equal(size,4096);assert.equal(length,65);
 const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
 const expand=(prk,info,length)=>hmac(prk,Buffer.concat([info,Buffer.from([1])])).subarray(0,length);
 const authPrk=hmac(auth,receiver.computeSecret(sender));
 const ikm=expand(authPrk,Buffer.concat([Buffer.from('WebPush: info\0'),receiver.getPublicKey(),sender]),32);
 const prk=hmac(salt,ikm),key=expand(prk,Buffer.from('Content-Encoding: aes128gcm\0'),16),nonce=expand(prk,Buffer.from('Content-Encoding: nonce\0'),12);
 const decipher=createDecipheriv('aes-128-gcm',key,nonce);decipher.setAuthTag(ciphertext.subarray(-16));
 const plaintext=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);let end=plaintext.length;while(plaintext[end-1]===0)end--;assert.equal(plaintext[end-1],2);
 assert.deepEqual(JSON.parse(plaintext.subarray(0,end-1).toString()),data);
 const token=request.headers.authorization.match(/t=([^, ]+)/)[1],parts=token.split('.');
 const claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,'https://example.test');
 const jwk={kty:'EC',crv:'P-256',x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url')};
 const verifyKey=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},verifyKey,Buffer.from(parts[2],'base64url'),Buffer.from(parts[0]+'.'+parts[1])),true);
});
test('new-stamp outbox targets the right board and retry does not send twice',async()=>{
 const {db,sql,device,stamp}=database();device('first',1,0);device('second',0,1);await stamp('stamp','second');
 let calls=0;const send=async d=>{assert.equal(d.id,'second');calls++;return 201;};
 await drainPush(db,vapid,{send,now:()=>new Date(NOW)});await db.batch(pushEventStatements(db,'stamp','second',NOW));await drainPush(db,vapid,{send,now:()=>new Date(NOW)});
 assert.equal(calls,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM push_deliveries').get().n,1);sql.close();
});
test('lease prevents simultaneous workers delivering the same notification',async()=>{
 const {db,sql,device,stamp}=database();device('device',1,0);await stamp('stamp','first');let calls=0;
 const options={send:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return 201;},now:()=>new Date(NOW)};
 await Promise.all([drainPush(db,vapid,options),drainPush(db,vapid,options)]);assert.equal(calls,1);sql.close();
});
test('temporary failure remains queued, respects backoff and succeeds later',async()=>{
 const {db,sql,device,stamp}=database();device('device',1,0);await stamp('stamp','first');
 const first=await drainPush(db,vapid,{send:async()=>503,now:()=>new Date(NOW)});assert.equal(first.failed,1);assert.equal(first.pending,1);
 let calls=0;const send=async()=>{calls++;return 201;};await drainPush(db,vapid,{send,now:()=>new Date(NOW)});assert.equal(calls,0);
 const next=await drainPush(db,vapid,{send,now:()=>new Date(Date.parse(NOW)+61000)});assert.equal(next.accepted,1);assert.equal(next.pending,0);sql.close();
});
test('expired subscriptions are removed; disabled topics and deleted stamps are not notified',async()=>{
 for(const mode of ['gone','disabled','deleted']){
  const {db,sql,device,stamp}=database();device('device',1,0);await stamp('stamp','first');
  if(mode==='disabled')sql.prepare('UPDATE push_subscriptions SET first_enabled=0').run();
  if(mode==='deleted')sql.prepare('DELETE FROM praise_stamps').run();let calls=0;
  await drainPush(db,vapid,{send:async()=>{calls++;return 410;},now:()=>new Date(NOW)});
  assert.equal(calls,mode==='gone'?1:0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM push_deliveries WHERE sent_at IS NULL').get().n,0);sql.close();
 }
});
test('no old stamps are sent to a newly registered device and notifications do not reveal content',async()=>{
 const {db,sql,device,stamp}=database();await stamp('old','first');device('new-device',1,0);
 await db.batch(pushEventStatements(db,'old','first','2026-10-12T12:01:00.000Z'));
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM push_deliveries').get().n,0);
 const data=notificationData('first','old');assert.equal(data.url,'/?board=first&stamp=old');assert.equal('content' in data,false);sql.close();
});
test('service worker displays push and opens the intended record, rejecting external click URLs',async()=>{
 const handlers={};let notification,opened;
 const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 const self={location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn,
  registration:{showNotification:async(title,options)=>{notification={title,options};}},
  clients:{matchAll:async()=>[],openWindow:async url=>{opened=url;}}};
 runInNewContext(source,{self,URL,Uint8Array,atob});let pending;
 const data=notificationData('second','stamp-id');handlers.push({data:{json:()=>data},waitUntil:p=>pending=p});await pending;
 assert.equal(notification.title,data.title);assert.equal(notification.options.tag,'dozang-stamp-id');
 for(const [url,expected] of [[data.url,'https://example.test/?board=second&stamp=stamp-id'],['https://other.test/private','https://example.test/']]){
  handlers.notificationclick({notification:{data:{url},close(){}},waitUntil:p=>pending=p});await pending;assert.equal(opened,expected);
 }
 assert.equal('fetch' in handlers,false);
});

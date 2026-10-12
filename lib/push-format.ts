import { BOARDS, type BoardId } from './stamps.ts';
export type DeviceSubscription={endpoint:string;expirationTime:null;keys:{p256dh:string;auth:string}};
export function base64Bytes(text:string):Uint8Array {
  if(!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('잘못된 알림 연결 값입니다.');
  const raw=atob(text.replaceAll('-','+').replaceAll('_','/'));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export function allowedPushEndpoint(endpoint:string):boolean {
  try {
    const u=new URL(endpoint);
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
    return u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||
      u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com');
  }catch{return false;}
}
export function deviceSubscription(value:unknown):DeviceSubscription {
  const s=value as {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}}|null;
  if(!s||typeof s.endpoint!=='string'||s.endpoint.length>3000||!allowedPushEndpoint(s.endpoint)||
    typeof s.keys?.p256dh!=='string'||typeof s.keys.auth!=='string')throw new Error('지원하는 브라우저에서 알림을 연결해 주세요.');
  const key=base64Bytes(s.keys.p256dh),auth=base64Bytes(s.keys.auth);
  if(key.length!==65||key[0]!==4||auth.length!==16)throw new Error('알림 연결 값이 올바르지 않습니다.');
  return {endpoint:s.endpoint,expirationTime:null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function subscriptionId(s:DeviceSubscription):Promise<string> {
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s.endpoint)));
  return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
}
export function notificationData(board:BoardId,stampId:string,test=false) {
  return {title:test?'커플도장 알림 확인':`${BOARDS[board]}에게 새 칭찬이 도착했어요`,
    body:test?'이 휴대폰에서 새 칭찬 알림을 받을 수 있어요.':'새로운 잘했어요! 도장을 눌러서 확인해 주세요.',
    tag:`dozang-${stampId}`,url:`/?board=${board}${test?'':'&stamp='+encodeURIComponent(stampId)}`};
}

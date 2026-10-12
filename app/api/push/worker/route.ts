import { getDb } from '../../../../db';
import { isBackupRunner } from '../../../../lib/backup-runner-auth';
import { pushKeys } from '../../../../lib/push-server';
import { drainPush } from '../../../../lib/push-queue';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request) {
  if(!await isBackupRunner(request))return reply({error:'인증 실패'},401);
  const keys=pushKeys();if(!keys)return reply({configured:false,pending:0});
  try{return reply(await drainPush(getDb(),keys));}catch{return reply({error:'알림 재시도 실패'},503);}
}

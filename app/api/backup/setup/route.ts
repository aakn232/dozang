import { getChatGPTUser } from '../../../chatgpt-auth';
import { backupSettings } from '../../../../lib/backup-runner-auth';
import config from '../../../../.openai/backup.json';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
export async function GET() {
  const user=await getChatGPTUser(), settings=backupSettings();
  if(!user||!settings.ownerEmail||user.email.toLowerCase()!==settings.ownerEmail.toLowerCase())return Response.json({error:'사이트 소유자만 연결 설정을 볼 수 있어요.'},{status:403,headers});
  if(!settings.key||!settings.siteAccess)return Response.json({error:'서버의 백업 연결 설정이 아직 준비되지 않았어요.'},{status:503,headers});
  return Response.json({secret:JSON.stringify({site_url:config.site_url,runner_key:settings.key,site_access:settings.siteAccess})},{headers});
}

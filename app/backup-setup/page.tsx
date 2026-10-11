import { requireChatGPTUser } from '../chatgpt-auth';
import { backupSettings } from '../../lib/backup-runner-auth';
import Setup from './setup';
export const dynamic='force-dynamic';
export default async function Page() {
  const user=await requireChatGPTUser('/backup-setup');
  const owner=backupSettings().ownerEmail;
  if(!owner||user.email.toLowerCase()!==owner.toLowerCase())return <main style={{padding:24}}>사이트 소유자 계정으로 로그인해 주세요.</main>;
  return <Setup/>;
}

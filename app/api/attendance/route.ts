import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { koreaDay } from '../../../lib/attendance';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
  const user=await getChatGPTUser();if(!user)return reply({error:'로그인이 필요합니다.'},401);
  try {
    const rows=await getDb().prepare('SELECT day, created_at FROM attendance WHERE user_id = ? ORDER BY day DESC').bind(user.userId).all();
    return reply({records:rows.results,today:koreaDay()});
  }catch(error){console.error('attendance read failed',error);return reply({error:'기록을 불러오지 못했습니다. 다시 시도해 주세요.'},503);}
}
export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return reply({error:'로그인이 필요합니다.'},401);
  const origin=request.headers.get('origin');
  if(!origin||origin!==new URL(request.url).origin)return reply({error:'허용되지 않은 요청입니다.'},403);
  try{
    const today=koreaDay();
    const result=await getDb().prepare('INSERT INTO attendance (user_id,day,created_at) VALUES (?,?,?) ON CONFLICT(user_id,day) DO NOTHING').bind(user.userId,today,new Date().toISOString()).run();
    return reply({today,alreadyChecked:result.meta.changes===0});
  }catch(error){console.error('attendance write failed',error);return reply({error:'출석을 저장하지 못했습니다. 다시 시도해 주세요.'},503);}
}

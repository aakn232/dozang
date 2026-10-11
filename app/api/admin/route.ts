import { deletionPassword, koreaDay } from '../../../lib/stamps';
import { isSameOrigin } from '../../../lib/request-origin';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return reply({error:'허용되지 않은 요청입니다.'}, 403);
  let body: {password?:unknown};
  try { body = await request.json() as typeof body; } catch { return reply({error:'잘못된 요청입니다.'}, 400); }
  const now = new Date();
  if (!body || typeof body.password !== 'string' || body.password !== deletionPassword(now)) {
    return reply({error:'비밀번호가 맞지 않습니다. 오늘 날짜의 비밀번호를 입력해 주세요.'}, 403);
  }
  return reply({today:koreaDay(now)});
}

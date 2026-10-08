import { getDb } from '../../../db';
import { koreaDay } from '../../../lib/attendance';
import { createVisitorToken, readVisitorToken, visitorCookie, visitorKey, isSameOrigin } from '../../../lib/visitor';

export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200, cookie?: string) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
});

export async function GET(request: Request) {
  // Do not mint/refresh visitor identities from cross-site subresource requests.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const token = readVisitorToken(request) ?? createVisitorToken();
  try {
    const key = await visitorKey(token);
    const rows = await getDb().prepare('SELECT day, created_at FROM attendance WHERE user_id = ? ORDER BY day DESC').bind(key).all();
    return reply({ records: rows.results, today: koreaDay() }, 200, visitorCookie(request, token));
  } catch (error) {
    console.error('attendance read failed', error);
    return reply({ error: '기록을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const token = readVisitorToken(request);
  if (!token) return reply({ error: '브라우저의 쿠키를 허용한 뒤 다시 불러와 주세요. 쿠키로 내 출석 수첩을 구분합니다.' }, 409);
  try {
    const today = koreaDay();
    const key = await visitorKey(token);
    const result = await getDb().prepare('INSERT INTO attendance (user_id,day,created_at) VALUES (?,?,?) ON CONFLICT(user_id,day) DO NOTHING')
      .bind(key, today, new Date().toISOString()).run();
    return reply({ today, alreadyChecked: result.meta.changes === 0 }, 200, visitorCookie(request, token));
  } catch (error) {
    console.error('attendance write failed', error);
    return reply({ error: '출석을 저장하지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

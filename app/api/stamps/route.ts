import { getDb } from '../../../db';
import { deletionPassword, koreaDay, type StampRecord } from '../../../lib/stamps';
import { createVisitorToken, readVisitorToken, visitorCookie, visitorKey, isSameOrigin } from '../../../lib/visitor';

export const dynamic = 'force-dynamic';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LEGACY_ID = /^legacy:\d{4}-\d{2}-\d{2}$/;
const reply = (data: unknown, status = 200, cookie?: string) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
});

export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const token = readVisitorToken(request) ?? createVisitorToken();
  try {
    const key = await visitorKey(token);
    const db = getDb();
    // Keep existing stamps visible without rewriting already-applied migrations or old data.
    const results = await db.batch<StampRecord>([
      db.prepare('SELECT id, day, created_at FROM praise_stamps WHERE user_id = ?').bind(key),
      db.prepare("SELECT 'legacy:' || day AS id, day, created_at FROM attendance WHERE user_id = ?").bind(key),
    ]);
    const records = results.flatMap(result => result.results).sort((a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    return reply({ records, today: koreaDay() }, 200, visitorCookie(request, token));
  } catch (error) {
    console.error('stamp read failed', error);
    return reply({ error: '도장을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const token = readVisitorToken(request);
  if (!token) return reply({ error: '브라우저의 쿠키를 허용한 뒤 다시 불러와 주세요. 쿠키로 내 도장 수첩을 구분합니다.' }, 409);
  let body: { id?: unknown };
  try { body = await request.json() as typeof body; } catch { return reply({ error: '잘못된 요청입니다.' }, 400); }
  if (!body || typeof body.id !== 'string' || !UUID.test(body.id)) return reply({ error: '잘못된 도장 번호입니다.' }, 400);
  try {
    const key = await visitorKey(token);
    const today = koreaDay();
    const db = getDb();
    const results = await db.batch([
      db.prepare('INSERT INTO praise_stamps (id,user_id,day,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING')
        .bind(body.id, key, today, new Date().toISOString()),
      db.prepare('SELECT id, day, created_at FROM praise_stamps WHERE id = ? AND user_id = ?').bind(body.id, key),
    ]);
    const record = results[1].results[0];
    if (!record) return reply({ error: '도장 번호가 겹쳤습니다. 다시 시도해 주세요.' }, 409);
    return reply({ record, today, alreadyAdded: results[0].meta.changes === 0 }, 200, visitorCookie(request, token));
  } catch (error) {
    console.error('stamp write failed', error);
    return reply({ error: '도장을 저장하지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const token = readVisitorToken(request);
  if (!token) return reply({ error: '도장 수첩을 찾을 수 없습니다. 다시 불러와 주세요.' }, 409);
  let body: { id?: unknown; password?: unknown };
  try { body = await request.json() as typeof body; } catch { return reply({ error: '잘못된 요청입니다.' }, 400); }
  if (!body || typeof body.id !== 'string' || !(UUID.test(body.id) || LEGACY_ID.test(body.id))) {
    return reply({ error: '잘못된 도장 번호입니다.' }, 400);
  }
  // Never trust a browser-supplied date or password calculation.
  if (typeof body.password !== 'string' || body.password !== deletionPassword()) {
    return reply({ error: '비밀번호가 맞지 않습니다. 오늘 날짜의 비밀번호를 입력해 주세요.' }, 403);
  }
  try {
    const key = await visitorKey(token);
    const legacy = body.id.startsWith('legacy:');
    const result = legacy
      ? await getDb().prepare('DELETE FROM attendance WHERE user_id = ? AND day = ?').bind(key, body.id.slice(7)).run()
      : await getDb().prepare('DELETE FROM praise_stamps WHERE user_id = ? AND id = ?').bind(key, body.id).run();
    if (!result.meta.changes) return reply({ error: '도장을 찾을 수 없습니다. 이미 없어진 도장일 수 있습니다.' }, 404);
    return reply({ removedId: body.id, today: koreaDay() }, 200, visitorCookie(request, token));
  } catch (error) {
    console.error('stamp delete failed', error);
    return reply({ error: '도장을 없애지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

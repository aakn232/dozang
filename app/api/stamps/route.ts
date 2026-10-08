import { getDb } from '../../../db';
import { deletionPassword, koreaDay, type StampRecord } from '../../../lib/stamps';
import { isSameOrigin } from '../../../lib/request-origin';

export const dynamic = 'force-dynamic';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LEGACY_ID = /^legacy:[1-9]\d{0,18}$/;
const SHARED_BOARD = 'shared-board';
const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  try {
    const db = getDb();
    // The board is shared across all visitors. Preserve existing stamps; never expose visitor identifiers.
    const results = await db.batch<StampRecord>([
      db.prepare('SELECT id, day, created_at, content FROM praise_stamps'),
      db.prepare("SELECT 'legacy:' || rowid AS id, day, created_at, '' AS content FROM attendance"),
    ]);
    const records = results.flatMap(result => result.results).sort((a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    return reply({ records, today: koreaDay() });
  } catch (error) {
    console.error('stamp read failed', error);
    return reply({ error: '도장을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  let body: { id?: unknown; content?: unknown };
  try { body = await request.json() as typeof body; } catch { return reply({ error: '잘못된 요청입니다.' }, 400); }
  if (!body || typeof body.id !== 'string' || !UUID.test(body.id)) return reply({ error: '잘못된 도장 번호입니다.' }, 400);
  if (body.content !== undefined && (typeof body.content !== 'string' || body.content.length > 300)) {
    return reply({ error: '칭찬 내용은 300자 이내로 입력해 주세요.' }, 400);
  }
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  try {
    const today = koreaDay();
    const db = getDb();
    const results = await db.batch([
      db.prepare('INSERT INTO praise_stamps (id,user_id,day,created_at,content) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
        .bind(body.id, SHARED_BOARD, today, new Date().toISOString(), content),
      db.prepare('SELECT id, day, created_at, content FROM praise_stamps WHERE id = ? AND user_id = ?').bind(body.id, SHARED_BOARD),
    ]);
    const record = results[1].results[0];
    if (!record) return reply({ error: '도장 번호가 겹쳤습니다. 다시 시도해 주세요.' }, 409);
    return reply({ record, today, alreadyAdded: results[0].meta.changes === 0 });
  } catch (error) {
    console.error('stamp write failed', error);
    return reply({ error: '도장을 저장하지 못했습니다. 입력한 내용을 유지했으니 다시 시도해 주세요.' }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  let body: { id?: unknown; password?: unknown };
  try { body = await request.json() as typeof body; } catch { return reply({ error: '잘못된 요청입니다.' }, 400); }
  if (!body || typeof body.id !== 'string' || !(UUID.test(body.id) || LEGACY_ID.test(body.id))) {
    return reply({ error: '잘못된 도장 번호입니다.' }, 400);
  }
  // Compute using the server's current Korean date, never a browser-supplied date.
  if (typeof body.password !== 'string' || body.password !== deletionPassword()) {
    return reply({ error: '비밀번호가 맞지 않습니다. 오늘 날짜의 비밀번호를 입력해 주세요.' }, 403);
  }
  try {
    const result = body.id.startsWith('legacy:')
      ? await getDb().prepare('DELETE FROM attendance WHERE rowid = CAST(? AS INTEGER)').bind(body.id.slice(7)).run()
      : await getDb().prepare('DELETE FROM praise_stamps WHERE id = ?').bind(body.id).run();
    if (!result.meta.changes) return reply({ error: '도장을 찾을 수 없습니다. 이미 없어진 도장일 수 있습니다.' }, 404);
    return reply({ removedId: body.id, today: koreaDay() });
  } catch (error) {
    console.error('stamp delete failed', error);
    return reply({ error: '도장을 없애지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

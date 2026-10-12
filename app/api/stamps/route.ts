import { getDb } from '../../../db';
import { deletionPassword, koreaDay, isValidStampDay, stampOrder, MAX_STAMP_CONTENT_LENGTH, isBoardId, type StampRecord } from '../../../lib/stamps';
import { isSameOrigin } from '../../../lib/request-origin';
import { snapshot, queue } from '../../../lib/backup-store';
import { pushEventStatements } from '../../../lib/push-queue';
import { dispatchPhoneNotifications } from '../../../lib/push-server';

export const dynamic = 'force-dynamic';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LEGACY_ID = /^legacy:[1-9]\d{0,18}$/;
const SHARED_BOARD = 'shared-board';
const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const board = new URL(request.url).searchParams.get('board') ?? 'first';
  if (!isBoardId(board)) return reply({ error: '도장판을 확인해 주세요.' }, 400);
  try {
    const db = getDb();
    // Each partner has a shared board. Existing and legacy records stay on the first board.
    const results = await db.batch<StampRecord>([
      db.prepare('SELECT id, day, created_at, content FROM praise_stamps WHERE board = ?').bind(board),
      db.prepare("SELECT 'legacy:' || rowid AS id, day, created_at, '' AS content FROM attendance WHERE ? = 'first'").bind(board),
    ]);
    const records = results.flatMap(result => result.results).sort(stampOrder);
    return reply({ records, today: koreaDay() });
  } catch (error) {
    console.error('stamp read failed', error);
    return reply({ error: '도장을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  let body: { id?: unknown; board?: unknown; content?: unknown; day?: unknown; adminPassword?: unknown; adminDay?: unknown };
  try { body = await request.json() as typeof body; } catch { return reply({ error: '잘못된 요청입니다.' }, 400); }
  if (!body || typeof body.id !== 'string' || !UUID.test(body.id)) return reply({ error: '잘못된 도장 번호입니다.' }, 400);
  const board = body.board === undefined ? 'first' : body.board;
  if (!isBoardId(board)) return reply({ error: '도장판을 확인해 주세요.' }, 400);
  if (body.content !== undefined && (typeof body.content !== 'string' || body.content.length > MAX_STAMP_CONTENT_LENGTH)) {
    return reply({ error: `칭찬 내용은 ${MAX_STAMP_CONTENT_LENGTH.toLocaleString('ko-KR')}자 이내로 입력해 주세요.` }, 400);
  }
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  try {
    const now = new Date();
    const today = koreaDay(now);
    const day = body.day === undefined ? today : body.day;
    if (!isValidStampDay(day, today)) return reply({ error: '오늘 또는 지난 날짜를 선택해 주세요.' }, 400);
    if (day !== today && (body.adminDay !== today || body.adminPassword !== deletionPassword(now))) {
      return reply({ error: '지난 날짜에 추가하려면 오늘의 비밀번호로 관리자 모드를 활성화해 주세요.' }, 401);
    }
    const db = getDb();
    const results = await db.batch([
      db.prepare('INSERT INTO praise_stamps (id,user_id,day,created_at,content,board) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM stamp_archive WHERE id=? AND deleted_at IS NOT NULL) ON CONFLICT(id) DO NOTHING')
        .bind(body.id, SHARED_BOARD, day, now.toISOString(), content, board, body.id),
      snapshot(db, body.id, crypto.randomUUID()),
      queue(db, body.id, null),
      db.prepare('SELECT id, day, created_at, content FROM praise_stamps WHERE id = ? AND user_id = ? AND board = ?').bind(body.id, SHARED_BOARD, board),
      ...pushEventStatements(db,body.id,board,now.toISOString()),
    ]);
    const record = results[3].results[0];
    if (!record) return reply({ error: '도장 번호가 겹쳤습니다. 다시 시도해 주세요.' }, 409);
    await dispatchPhoneNotifications();
    return reply({ record, today, alreadyAdded: results[0].meta.changes === 0 });
  } catch (error) {
    console.error('stamp write failed', error);
    return reply({ error: '도장을 저장하지 못했습니다. 입력한 내용을 유지했으니 다시 시도해 주세요.' }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  let body: { id?: unknown; password?: unknown; board?: unknown };
  try { body = await request.json() as typeof body; } catch { return reply({ error: '잘못된 요청입니다.' }, 400); }
  if (!body || typeof body.id !== 'string' || !(UUID.test(body.id) || LEGACY_ID.test(body.id))) {
    return reply({ error: '잘못된 도장 번호입니다.' }, 400);
  }
  const board = body.board === undefined ? 'first' : body.board;
  if (!isBoardId(board)) return reply({ error: '도장판을 확인해 주세요.' }, 400);
  // Compute using the server's current Korean date, never a browser-supplied date.
  if (typeof body.password !== 'string' || body.password !== deletionPassword()) {
    return reply({ error: '비밀번호가 맞지 않습니다. 오늘 날짜의 비밀번호를 입력해 주세요.' }, 403);
  }
  try {
    const db = getDb(), revision=crypto.randomUUID(), now=new Date().toISOString();
    const sourceCheck = body.id.startsWith('legacy:')
      ? "EXISTS (SELECT 1 FROM attendance WHERE rowid=CAST(substr(stamp_archive.id,8) AS INTEGER))"
      : 'EXISTS (SELECT 1 FROM praise_stamps WHERE id=stamp_archive.id AND board=stamp_archive.board)';
    const results = await db.batch([
      snapshot(db,body.id,revision),
      db.prepare(`UPDATE stamp_archive SET deleted_at=?,revision=? WHERE id=? AND board=? AND deleted_at IS NULL AND ${sourceCheck}`).bind(now,revision,body.id,board),
      queue(db,body.id,revision,now),
      body.id.startsWith('legacy:')
        ? db.prepare("DELETE FROM attendance WHERE rowid = CAST(? AS INTEGER) AND ? = 'first'").bind(body.id.slice(7),board)
        : db.prepare('DELETE FROM praise_stamps WHERE id = ? AND board = ?').bind(body.id,board),
    ]);
    const result=results[3];
    if (!result.meta.changes) return reply({ error: '도장을 찾을 수 없습니다. 이미 없어진 도장일 수 있습니다.' }, 404);
    return reply({ removedId: body.id, today: koreaDay() });
  } catch (error) {
    console.error('stamp delete failed', error);
    return reply({ error: '도장을 없애지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}

import { isBoardId, isValidStampDay, MAX_STAMP_CONTENT_LENGTH, type BoardId } from './stamps.ts';

export type BackupRecord = {
  id: string; board: BoardId; day: string; created_at: string; content: string; deleted_at: string | null;
};
export type BackupBundle = { format: 'dozang-backup'; schema_version: 1; records: BackupRecord[] };
export const validStampId = (value: unknown): value is string => typeof value === 'string' &&
  (/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) || /^legacy:[1-9]\d{0,18}$/.test(value));

export function backupRecord(value: unknown): BackupRecord {
  if (!value || typeof value !== 'object') throw new Error('백업 기록 형식이 올바르지 않습니다.');
  const r = value as Record<string, unknown>;
  if (!validStampId(r.id) || !isBoardId(r.board) || !isValidStampDay(r.day, '9999-12-31') ||
      typeof r.created_at !== 'string' || !Number.isFinite(Date.parse(r.created_at)) ||
      typeof r.content !== 'string' || r.content.length > MAX_STAMP_CONTENT_LENGTH ||
      !(r.deleted_at === null || typeof r.deleted_at === 'string' && Number.isFinite(Date.parse(r.deleted_at))) ||
      r.id.startsWith('legacy:') && r.board !== 'first') throw new Error('백업 기록 형식이 올바르지 않습니다.');
  return {id:r.id, board:r.board, day:r.day, created_at:r.created_at, content:r.content, deleted_at:r.deleted_at};
}
export function readBundle(value: unknown): BackupBundle {
  const b = value as Partial<BackupBundle> | null;
  if (!b || b.format !== 'dozang-backup' || b.schema_version !== 1 || !Array.isArray(b.records) || b.records.length > 1000) {
    throw new Error('지원하는 커플도장 백업 파일이 아닙니다. 한 번에 최대 1,000개를 복원할 수 있습니다.');
  }
  const records = b.records.map(backupRecord);
  if (new Set(records.map(r=>r.id)).size !== records.length) throw new Error('백업 파일에 중복된 도장 번호가 있습니다.');
  return {format:'dozang-backup', schema_version:1, records};
}
export async function contentHash(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b=>b.toString(16).padStart(2,'0')).join('');
}
function chunks(text: string, limit = 1500): string[] {
  const result: string[] = []; let current = '', length = 0;
  for (const point of text) {
    const size = JSON.stringify(point).length - 2;
    if (length + size > limit) { result.push(current); current = ''; length = 0; }
    current += point; length += size;
  }
  result.push(current); return result;
}
export async function notionContent(record: BackupRecord): Promise<{content: string; hash: string}> {
  const {content, ...metadata} = backupRecord(record);
  const parts = chunks(content), hash = await contentHash(content);
  const escaped = chunks(content,600).map(part=>'> '+part.replace(/[\\*~`$\[\]<>{}|^#]/g, '\\$&').replace(/\r\n|\r|\n/g, '<br>')).join('\n\n');
  const header = {format:'dozang-record', schema_version:1, ...metadata, content_length:content.length, chunk_count:parts.length, content_sha256:hash};
  // JSON strings encode newlines: code fences or markup in user input cannot create Notion blocks.
  const recovery = [header, ...parts.map((text,index)=>({format:'dozang-chunk',index,text}))]
    .map(value=>'```json\n'+JSON.stringify(value)+'\n```').join('\n\n');
  return {hash, content:`## 칭찬 내용\n\n${content ? escaped : '내용 없이 찍은 도장입니다.'}\n\n## 복원 데이터\n\n아래 데이터는 원문의 줄바꿈과 공백을 그대로 복원하기 위한 기록입니다.\n\n${recovery}`};
}
export async function recordFromNotion(markdown: string): Promise<BackupRecord> {
  const values: Record<string, unknown>[] = [];
  for (const match of markdown.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)) {
    try { values.push(JSON.parse(match[1])); } catch { /* Ignore unrelated blocks. */ }
  }
  const headers = values.filter(v=>v.format==='dozang-record');
  if (headers.length!==1 || headers[0].schema_version!==1) throw new Error('복원 데이터 헤더가 올바르지 않습니다.');
  const h=headers[0], parts=values.filter(v=>v.format==='dozang-chunk');
  if (parts.length!==h.chunk_count || parts.some((p,i)=>p.index!==i || typeof p.text!=='string')) throw new Error('복원 데이터 조각이 누락되거나 순서가 다릅니다.');
  const content=parts.map(p=>p.text).join('');
  if(content.length!==h.content_length || await contentHash(content)!==h.content_sha256) throw new Error('백업 원문 검증에 실패했습니다.');
  return backupRecord({...h,content});
}

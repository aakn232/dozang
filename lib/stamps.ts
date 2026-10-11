export const MAX_STAMP_CONTENT_LENGTH = 10_000;
export const BOARDS = { first: '기훈', second: '빛나' } as const;
export type BoardId = keyof typeof BOARDS;
export function isBoardId(value: unknown): value is BoardId {
  return value === 'first' || value === 'second';
}

export function koreaDay(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
/** Day of the month, not the entire YYYYMMDD date. Always evaluated server-side. */
export function deletionPassword(now = new Date()): string {
  const day = Number(koreaDay(now).slice(8));
  const digitSum = String(day).split('').reduce((sum, digit) => sum + Number(digit), 0);
  return String(digitSum * day);
}
export type StampRecord = { id: string; day: string; created_at: string; content: string };

export function isValidStampDay(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0,4) === '0000' || value > today) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
export function stampOrder(a: StampRecord, b: StampRecord): number {
  return b.day.localeCompare(a.day) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

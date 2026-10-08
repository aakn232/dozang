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
export type StampRecord = { id: string; day: string; created_at: string };

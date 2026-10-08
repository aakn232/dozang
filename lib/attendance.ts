export function koreaDay(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function previousDay(day: string): string {
  const d = new Date(day+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10);
}
export function currentStreak(days: string[], today: string): number {
  const set = new Set(days); let cursor = set.has(today) ? today : previousDay(today); let count=0;
  while(set.has(cursor)){count++;cursor=previousDay(cursor);}return count;
}

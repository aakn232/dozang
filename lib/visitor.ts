/** An unguessable, HttpOnly browser capability; never accept a client-supplied user ID. */
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export function visitorCookieName(request: Request): string {
  return new URL(request.url).protocol === 'https:' ? '__Host-dozang_visitor' : 'dozang_visitor';
}
export function readVisitorToken(request: Request): string | null {
  const name = visitorCookieName(request);
  const value = request.headers.get('cookie')?.split(';').map(v => v.trim())
    .find(v => v.startsWith(name + '='))?.slice(name.length + 1);
  return value && TOKEN_PATTERN.test(value) ? value : null;
}
export function createVisitorToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function visitorKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return 'guest:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function visitorCookie(request: Request, token: string): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${visitorCookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}
export function isSameOrigin(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin
    && request.headers.get('sec-fetch-site') !== 'cross-site';
}

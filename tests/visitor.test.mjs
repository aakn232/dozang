import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVisitorToken, readVisitorToken, visitorCookie, visitorKey, isSameOrigin } from '../lib/visitor.ts';
test('anonymous cookie is unguessable, host-only, HttpOnly and Secure on HTTPS', async () => {
  const token = createVisitorToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, createVisitorToken());
  const r = new Request('https://dozang.example/api/stamps');
  const cookie = visitorCookie(r, token);
  assert.match(cookie, /^__Host-dozang_visitor=/);
  assert.match(cookie, /; HttpOnly;/);
  assert.match(cookie, /; Secure$/);
  assert.match(cookie, /SameSite=Lax/);
  assert.ok(!cookie.includes('Domain='));
  const key = await visitorKey(token);
  assert.equal(key, await visitorKey(token));
  assert.notEqual(key, await visitorKey(createVisitorToken()));
  assert.ok(!key.includes(token));
});
test('cookie parser rejects invalid identities and HTTP cookie name on HTTPS', () => {
  const token = createVisitorToken();
  const request = cookie => new Request('https://dozang.example/api/stamps', { headers: {cookie} });
  assert.equal(readVisitorToken(request(`other=a; __Host-dozang_visitor=${token}`)), token);
  assert.equal(readVisitorToken(request('')), null);
  assert.equal(readVisitorToken(request('__Host-dozang_visitor=admin')), null);
  assert.equal(readVisitorToken(request(`dozang_visitor=${token}`)), null);
});
test('writes require same-origin requests', () => {
  const request = headers => new Request('https://dozang.example/api/stamps', {method:'POST',headers});
  assert.ok(isSameOrigin(request({origin:'https://dozang.example'})));
  assert.ok(!isSameOrigin(request({})));
  assert.ok(!isSameOrigin(request({origin:'https://other.example'})));
  assert.ok(!isSameOrigin(request({origin:'https://dozang.example','sec-fetch-site':'cross-site'})));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin } from '../lib/request-origin.ts';
test('public writes require requests from the site origin', () => {
  const request = headers => new Request('https://dozang.example/api/stamps', {method:'POST',headers});
  assert.ok(isSameOrigin(request({origin:'https://dozang.example'})));
  assert.ok(!isSameOrigin(request({})));
  assert.ok(!isSameOrigin(request({origin:'https://other.example'})));
  assert.ok(!isSameOrigin(request({origin:'https://dozang.example','sec-fetch-site':'cross-site'})));
});

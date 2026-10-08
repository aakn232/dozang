"""Run against a local preview only; never supplies platform authentication headers."""
import concurrent.futures
import json
import urllib.error
import urllib.request

BASE = 'http://127.0.0.1:8787'

def request(path, method='GET', cookie=None, origin=BASE, extra=None):
    headers = dict(extra or {})
    if cookie:
        headers['Cookie'] = cookie
    if method == 'POST':
        headers['Origin'] = origin
    req = urllib.request.Request(BASE + path, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.read().decode(), response.headers

def visitor():
    status, body, headers = request('/api/attendance')
    assert status == 200, body
    assert json.loads(body)['records'] == []
    assert 'no-store' in headers['Cache-Control']
    assert 'HttpOnly' in headers['Set-Cookie']
    return headers['Set-Cookie'].split(';')[0]

status, html, _ = request('/')
assert status == 200
assert 'signin-with-chatgpt' not in html
assert '로그인하고 출석체크' not in html
assert '오늘의 도장' in html
assert 'class="primary"' in html
first, second = visitor(), visitor()
assert first != second
assert request('/api/attendance', 'POST')[0] == 409
assert request('/api/attendance', 'POST', first, 'https://other.example')[0] == 403
assert request('/api/attendance', extra={'Sec-Fetch-Site': 'cross-site'})[0] == 403
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    responses = list(pool.map(lambda _: request('/api/attendance', 'POST', first), range(5)))
assert all(r[0] == 200 for r in responses), responses
assert sum(not json.loads(r[1])['alreadyChecked'] for r in responses) == 1
assert len(json.loads(request('/api/attendance', cookie=first)[1])['records']) == 1
assert json.loads(request('/api/attendance', cookie=second)[1])['records'] == []
# Malformed cookies cannot access another visitor, and arbitrary bodies cannot target them.
assert request('/api/attendance', 'POST', 'dozang_visitor=admin')[0] == 409
assert json.loads(request('/api/attendance', cookie=first)[1])['records'][0]['day']
print('PASS: anonymous page, cookie identity, repeat visit, 5 concurrent writes = 1 stamp, visitor isolation, cookie rejection, cross-origin rejection')

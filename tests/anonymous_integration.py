"""Run against a local preview only. Verifies praise stamps, visitor isolation and password deletion."""
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import sqlite3
import urllib.error
import urllib.request
import uuid

BASE = 'http://127.0.0.1:8787'

def request(path, method='GET', cookie=None, origin=BASE, extra=None, body=None):
    headers = dict(extra or {})
    if cookie:
        headers['Cookie'] = cookie
    if method in ('POST', 'DELETE'):
        headers['Origin'] = origin
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, headers=headers, method=method, data=data)
    try:
        response = urllib.request.urlopen(req)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.read().decode(), response.headers

def visitor():
    status, body, headers = request('/api/stamps')
    assert status == 200, body
    assert json.loads(body)['records'] == []
    assert 'no-store' in headers['Cache-Control']
    assert 'HttpOnly' in headers['Set-Cookie']
    return headers['Set-Cookie'].split(';')[0]

def records(cookie):
    status, body, _ = request('/api/stamps', cookie=cookie)
    assert status == 200, body
    return json.loads(body)['records']

status, html, _ = request('/')
assert status == 200
assert 'signin-with-chatgpt' not in html
assert '출석체크' not in html
assert '잘했어요!' in html
assert '도장 없애기' in html
first, second = visitor(), visitor()
assert first != second
ids = [str(uuid.uuid4()) for _ in range(5)]
assert request('/api/stamps', 'POST', body={'id': ids[0]})[0] == 409
assert request('/api/stamps', 'POST', first, 'https://other.example', body={'id': ids[0]})[0] == 403
assert request('/api/stamps', extra={'Sec-Fetch-Site': 'cross-site'})[0] == 403
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    responses = list(pool.map(lambda ident: request('/api/stamps', 'POST', first, body={'id': ident}), ids))
assert all(r[0] == 200 for r in responses), responses
assert len(records(first)) == 5
assert records(second) == []
# Retrying one intentional stamp request never creates a second stamp.
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    responses = list(pool.map(lambda _: request('/api/stamps', 'POST', first, body={'id': ids[0]}), range(5)))
assert all(r[0] == 200 and json.loads(r[1])['alreadyAdded'] for r in responses)
assert len(records(first)) == 5

now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
password = str(sum(int(digit) for digit in str(now.day)) * now.day)
assert request('/api/stamps', 'DELETE', first, body={'id': ids[0], 'password': '0'})[0] == 403
assert len(records(first)) == 5
assert request('/api/stamps', 'DELETE', first, body={'id': ids[0], 'password': '0', 'today': '2026-01-01'})[0] == 403
assert request('/api/stamps', 'DELETE', second, body={'id': ids[0], 'password': password})[0] == 404
assert len(records(first)) == 5
assert request('/api/stamps', 'DELETE', first, 'https://other.example', body={'id': ids[0], 'password': password})[0] == 403
assert request('/api/stamps', 'DELETE', first, body={'id': ids[0], 'password': password})[0] == 200
remaining = records(first)
assert len(remaining) == 4
assert {row['id'] for row in remaining} == set(ids[1:])
assert request('/api/stamps', 'DELETE', first, body={'id': ids[0], 'password': password})[0] == 404
assert request('/api/stamps', 'POST', 'dozang_visitor=admin', body={'id': str(uuid.uuid4())})[0] == 409

# Fixture only in the local preview DB: preexisting attendance stays visible and can be removed.
local_db = [p for p in Path('.wrangler/state/v3/d1').rglob('*.sqlite') if p.name != 'metadata.sqlite']
assert len(local_db) == 1, local_db
key = 'guest:' + hashlib.sha256(first.split('=', 1)[1].encode()).hexdigest()
with sqlite3.connect(local_db[0]) as connection:
    connection.execute('INSERT INTO attendance(user_id,day,created_at) VALUES (?,?,?)',
                       (key, '2026-01-21', '2026-01-21T03:00:00Z'))
legacy = next(row for row in records(first) if row['id'] == 'legacy:2026-01-21')
assert request('/api/stamps', 'DELETE', first, body={'id': legacy['id'], 'password': '63'})[0] == (200 if password == '63' else 403)
if password != '63':
    assert request('/api/stamps', 'DELETE', first, body={'id': legacy['id'], 'password': password})[0] == 200
assert len(records(first)) == 4
assert records(second) == []
print('PASS: anonymous praise stamps, multiple stamps per day, retry deduplication, record persistence, visitor isolation, wrong password retains data, correct password removes only selected stamp, legacy records, CSRF checks')

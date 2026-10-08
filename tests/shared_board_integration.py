"""Local preview only: server-backed shared board, content, retries and password deletion."""
import concurrent.futures
import datetime
import json
from pathlib import Path
import sqlite3
import urllib.error
import urllib.request
import uuid

BASE = 'http://127.0.0.1:8787'

def request(method='GET', cookie=None, origin=BASE, body=None, extra=None):
    headers = dict(extra or {})
    if cookie:
        headers['Cookie'] = cookie
    if method in ('POST', 'DELETE'):
        headers['Origin'] = origin
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + '/api/stamps', headers=headers, method=method, data=data)
    try:
        response = urllib.request.urlopen(req)
    except urllib.error.HTTPError as error:
        response = error
    text = response.read().decode()
    return response.status, json.loads(text), response.headers

def records(cookie=None):
    status, body, headers = request(cookie=cookie)
    assert status == 200, body
    assert 'no-store' in headers['Cache-Control']
    assert headers.get('Set-Cookie') is None
    assert all('user_id' not in row for row in body['records'])
    return body['records']

baseline = len(records())
assert records() == records('dozang_visitor=someone-else')
ids = [str(uuid.uuid4()) for _ in range(5)]
text = '  책을 끝까지 읽었어요!\n정리도 했어요.  '
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    results = list(pool.map(lambda ident: request('POST', body={'id':ident, 'content':text}), ids))
assert all(result[0] == 200 for result in results), results
assert len(records()) == baseline + 5
for cookie in (None, 'other_device=new', 'dozang_visitor=admin'):
    saved = {row['id']:row for row in records(cookie)}
    assert all(saved[ident]['content'] == text.strip() for ident in ids)

# Replaying the same request must not duplicate or silently edit its original content.
status, data, _ = request('POST', body={'id':ids[0], 'content':'덮어쓰기 시도'})
assert status == 200 and data['alreadyAdded'] and data['record']['content'] == text.strip()
assert len(records()) == baseline + 5
assert request('POST', body={'id':str(uuid.uuid4()),'content':'가'*301})[0] == 400
assert request('POST', body={'id':str(uuid.uuid4()),'content':123})[0] == 400
blank = str(uuid.uuid4())
assert request('POST', body={'id':blank})[1]['record']['content'] == ''
assert request('POST', origin='https://other.example',body={'id':str(uuid.uuid4())})[0] == 403
assert request(extra={'Sec-Fetch-Site':'cross-site'})[0] == 403

now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
password = str(sum(map(int,str(now.day))) * now.day)
assert request('DELETE',body={'id':ids[0],'password':'0'})[0] == 403
assert len(records()) == baseline + 6
assert request('DELETE',origin='https://other.example',body={'id':ids[0],'password':password})[0] == 403
assert request('DELETE',body={'id':ids[0],'password':password})[0] == 200
assert len(records('new_device=yes')) == baseline + 5
assert ids[0] not in {row['id'] for row in records()}

# All historical stamps remain visible without publishing their visitor IDs.
local_db = [p for p in Path('.wrangler/state/v3/d1').rglob('*.sqlite') if p.name != 'metadata.sqlite']
assert len(local_db) == 1
key = 'local-fixture:' + str(uuid.uuid4())
with sqlite3.connect(local_db[0]) as connection:
    cursor = connection.execute('INSERT INTO attendance(user_id,day,created_at) VALUES (?,?,?)',
                               (key,'2026-01-21','2026-01-21T03:00:00Z'))
    legacy_id = 'legacy:' + str(cursor.lastrowid)
legacy = next(row for row in records() if row['id'] == legacy_id)
assert legacy['content'] == ''
assert request('DELETE',body={'id':legacy_id,'password':password})[0] == 200
for ident in ids[1:] + [blank]:
    assert request('DELETE',body={'id':ident,'password':password})[0] == 200
assert len(records()) == baseline
print('PASS: shared board across cookies/devices, no cookies issued, server content storage, retries, 300-character validation, password deletion, historical records, cross-origin checks')

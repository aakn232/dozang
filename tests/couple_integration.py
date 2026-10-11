"""Local-only checks for migration preservation and independent couple boards."""
import datetime
import json
from pathlib import Path
import sqlite3
import urllib.error
import urllib.request
import uuid

# Apply the new migration to an old database and preserve every existing value.
with sqlite3.connect(':memory:') as db:
    for name in ['0000_slow_sally_floyd.sql', '0001_elite_shen.sql', '0002_wealthy_lord_tyger.sql']:
        db.executescript(Path('drizzle', name).read_text())
    db.execute("INSERT INTO attendance VALUES ('original','2026-01-21','2026-01-21T01:00:00Z')")
    db.execute("INSERT INTO praise_stamps (id,user_id,day,created_at,content) VALUES ('original','visitor','2026-01-21','2026-01-21T01:00:00Z','소중한 기록\n그대로 보존')")
    before = db.execute('SELECT id,user_id,day,created_at,content FROM praise_stamps').fetchall()
    legacy = db.execute('SELECT * FROM attendance').fetchall()
    db.executescript(Path('drizzle/0003_friendly_lorna_dane.sql').read_text())
    assert db.execute('SELECT id,user_id,day,created_at,content FROM praise_stamps').fetchall() == before
    assert db.execute('SELECT * FROM attendance').fetchall() == legacy
    assert db.execute('SELECT board FROM praise_stamps').fetchall() == [('first',)]

BASE = 'http://127.0.0.1:8787'
def request(method='GET', board='first', body=None):
    headers = {'Connection': 'close', 'Origin': BASE, 'Content-Type': 'application/json'}
    data = json.dumps({**body, 'board': board}).encode() if body is not None else None
    req = urllib.request.Request(BASE + '/api/stamps?board=' + board, method=method, headers=headers, data=data)
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, json.loads(response.read())

def records(board):
    status, data = request(board=board)
    assert status == 200, data
    return data['records']

initial = {board: records(board) for board in ['first', 'second']}
today = request()[1]['today']
day = int(today[-2:])
password = str(sum(map(int, str(day))) * day)
created = []
try:
    for board in ['first', 'second']:
        ident = str(uuid.uuid4())
        content = board + '의 독립적인 칭찬\n서버에 저장'
        payload = {'id': ident, 'content': content}
        status, data = request('POST', board, payload)
        assert status == 200 and data['record']['content'] == content, data
        created.append((board, ident))
        assert request('POST', board, payload)[1]['alreadyAdded']
        other = 'second' if board == 'first' else 'first'
        assert ident not in {r['id'] for r in records(other)}
        assert request('POST', other, payload)[0] == 409
        assert request('DELETE', other, {'id': ident, 'password': password})[0] == 404
        assert request('DELETE', board, {'id': ident, 'password': '0'})[0] == 403
        assert any(r['id'] == ident for r in records(board))
    assert all(not r['id'].startswith('legacy:') for r in records('second'))
    assert request(board='unknown')[0] == 400
    assert request('POST', 'unknown', {'id': str(uuid.uuid4())})[0] == 400
    yesterday = (datetime.date.fromisoformat(today) - datetime.timedelta(days=1)).isoformat()
    ident = str(uuid.uuid4())
    payload = {'id': ident, 'content': '빛나의 지난 날짜', 'day': yesterday}
    assert request('POST', 'second', payload)[0] == 401
    status, data = request('POST', 'second', {**payload, 'adminDay': today, 'adminPassword': password})
    assert status == 200 and data['record']['day'] == yesterday
    created.append(('second', ident))
    assert ident not in {r['id'] for r in records('first')}
finally:
    for board, ident in created:
        assert request('DELETE', board, {'id': ident, 'password': password})[0] == 200
assert all(records(board) == initial[board] for board in initial)
print('PASS: migration preserves original content, independent board reads/writes/counts, duplicate isolation, scoped password deletion, second-board admin backdating, invalid boards rejected')

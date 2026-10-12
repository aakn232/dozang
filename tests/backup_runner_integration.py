"""Local-only authorization, cursor paging and owner setup checks; uses fake credentials."""
import json
import sqlite3
import uuid
from pathlib import Path
import urllib.request
import urllib.error

BASE='http://127.0.0.1:8787'
KEY='a'*64
def request(path,body=None,headers=None):
    h={'Origin':BASE,'Content-Type':'application/json','Connection':'close',**(headers or {})}
    req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=h)
    try:r=urllib.request.urlopen(req,timeout=15)
    except urllib.error.HTTPError as e:r=e
    return r.status,json.loads(r.read()),r.headers
paths=[p for p in Path('.wrangler/state/v3/d1').rglob('*.sqlite') if p.name!='metadata.sqlite']
assert len(paths)==1
def sql(query,args=()):
    with sqlite3.connect(paths[0]) as db:return db.execute(query,args).fetchall()

assert request('/api/backup/worker',{'action':'list'})[0]==401
assert request('/api/backup/worker',{'action':'list'},{'X-Dozang-Backup-Key':'wrong'})[0]==401
assert request('/api/backup/worker',{'action':'report','completed':0,'failed':0})[0]==401
assert request('/api/backup/worker',{'action':'resync'})[0]==401
assert request('/api/backup/setup')[0]==403
assert request('/api/backup/setup',headers={'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.test'})[0]==403
status,setup,headers=request('/api/backup/setup',headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'})
assert status==200 and 'no-store' in headers['Cache-Control']
assert json.loads(setup['secret'])['runner_key']==KEY

ids=[str(uuid.uuid4()) for _ in range(30)]
before_jobs={row[0] for row in sql('SELECT id FROM backup_jobs')}
resync_id=str(uuid.uuid4())
try:
    for ident in ids:
        sql('INSERT INTO backup_jobs (id,revision,ticket,queued_at) VALUES (?,?,?,?)',(ident,'local-test','b'*64,'2026-10-11T00:00:00Z'))
    after=None;found=set();requests=0
    while True:
        status,data,_=request('/api/backup/worker',{'action':'list',**({'after':after} if after else {})},{'X-Dozang-Backup-Key':KEY})
        assert status==200 and len(data['jobs'])<=25
        found.update(row['id'] for row in data['jobs']);requests+=1
        after=data['next_cursor']
        if not after:break
    assert set(ids)<=found and requests>=2
    sql('INSERT INTO stamp_archive (id,board,day,created_at,content,revision,backed_up_revision,backed_up_at) VALUES (?,?,?,?,?,?,?,?)',(resync_id,'second','2026-10-11','2026-10-11T00:00:00Z','recheck original','resync-test','resync-test','2026-10-11T01:00:00Z'))
    after=None
    while True:
        status,data,_=request('/api/backup/worker',{'action':'resync',**({'after':after} if after else {})},{'X-Dozang-Backup-Key':KEY})
        assert status==200
        after=data['next_cursor']
        if not after:break
    ticket=sql('SELECT ticket FROM backup_jobs WHERE id=?',(resync_id,))[0][0]
    after=None
    while True:
        status,data,_=request('/api/backup/worker',{'action':'resync',**({'after':after} if after else {})},{'X-Dozang-Backup-Key':KEY})
        after=data['next_cursor']
        if not after:break
    assert sql('SELECT ticket FROM backup_jobs WHERE id=?',(resync_id,))[0][0]==ticket
    assert sql('SELECT content,revision,backed_up_revision,backed_up_at FROM stamp_archive WHERE id=?',(resync_id,))[0]==('recheck original','resync-test','resync-test','2026-10-11T01:00:00Z')
    assert request('/api/backup/worker',{'action':'report','completed':0,'failed':0},{'X-Dozang-Backup-Key':KEY})[0]==200
    assert sql('SELECT last_run_at FROM backup_runner_status WHERE id=1')
    public=request('/api/stamps?board=first')[1]
    assert KEY not in json.dumps(public) and 'ticket' not in json.dumps(public)
    print('PASS: authenticated job pagination, original-preserving recheck, private owner-only setup, no-cache secrets, runner status and public data isolation')
finally:
    for row in sql('SELECT id FROM backup_jobs'):
        if row[0] not in before_jobs:sql('DELETE FROM backup_jobs WHERE id=?',(row[0],))
    sql('DELETE FROM stamp_archive WHERE id=?',(resync_id,))
    sql('DELETE FROM backup_runner_status WHERE id=1')

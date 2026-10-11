"""Local-only integration: deletion retention, authenticated jobs, retries and loss recovery."""
import datetime
import json
from pathlib import Path
import sqlite3
import urllib.request
import urllib.error
import uuid

BASE='http://127.0.0.1:8787'
def req(path,body=None,method='POST'):
    headers={'Origin':BASE,'Content-Type':'application/json','Connection':'close'}
    request=urllib.request.Request(BASE+path,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
    try:response=urllib.request.urlopen(request,timeout=15)
    except urllib.error.HTTPError as error:response=error
    return response.status,json.loads(response.read())
today=req('/api/stamps',method='GET')[1]['today']
day=int(today[-2:]);password=str(sum(map(int,str(day)))*day)
def admin(action,**extra):return req('/api/backup/admin',{'password':password,'board':'second','action':action,**extra})
paths=[p for p in Path('.wrangler/state/v3/d1').rglob('*.sqlite') if p.name!='metadata.sqlite']
assert len(paths)==1
def query(sql,params=()):
    with sqlite3.connect(paths[0]) as db:
        db.row_factory=sqlite3.Row
        return [dict(r) for r in db.execute(sql,params)]
def job(ident):return query('SELECT * FROM backup_jobs WHERE id=?',(ident,))[0]
def worker(j,action,**extra):return req('/api/backup/worker',{'id':j['id'],'ticket':j['ticket'],'action':action,**extra})
ident=str(uuid.uuid4()); content='공백  \n\n줄바꿈😀'+'가'*9986
ids=[ident]
try:
    assert req('/api/backup/admin',{'password':'0','board':'second','action':'export'})[0]==403
    status,data=req('/api/stamps',{'id':ident,'board':'second','content':content})
    assert status==200,data
    j=job(ident)
    assert worker({**j,'ticket':'0'*64},'claim')[0]==409
    status,claim=worker(j,'claim');assert status==200,claim
    assert claim['record']['content']==content
    assert worker(j,'claim')[0]==409
    assert worker(j,'ack',lease=claim['lease'],page_id=str(uuid.uuid4()),hash='wrong')[0]==400
    assert worker(j,'fail',lease=claim['lease'],error='temporary test failure')[0]==200
    assert job(ident)['last_error']=='temporary test failure'
    assert admin('status')[1]['stats']['failed']>=1
    status,claim=worker(j,'claim');assert status==200
    # Deletion while a backup is in flight invalidates its completion ticket.
    assert req('/api/stamps',{'id':ident,'board':'second','password':password},'DELETE')[0]==200
    assert worker(j,'ack',lease=claim['lease'],page_id=str(uuid.uuid4()),hash=claim['hash'])[0]==409
    assert query('SELECT content FROM stamp_archive WHERE id=?',(ident,))[0]['content']==content
    assert ident not in {r['id'] for r in req('/api/stamps?board=second',method='GET')[1]['records']}
    # Simulate the old worker's lease expiring, not a live wait.
    query('UPDATE backup_jobs SET lease_until=NULL WHERE id=?',(ident,))
    j=job(ident);status,claim=worker(j,'claim');assert status==200
    assert claim['record']['deleted_at'] and claim['record']['content']==content
    assert worker(j,'ack',lease=claim['lease'],page_id=str(uuid.uuid4()),hash=claim['hash'])[0]==200
    assert not query('SELECT * FROM backup_jobs WHERE id=?',(ident,))
    assert admin('restore',id=ident)[0]==200
    restored=next(r for r in req('/api/stamps?board=second',method='GET')[1]['records'] if r['id']==ident)
    assert restored['content']==content and restored['created_at']==data['record']['created_at']
    j=job(ident);status,claim=worker(j,'claim');assert status==200 and claim['record']['deleted_at'] is None
    assert worker(j,'ack',lease=claim['lease'],page_id=str(uuid.uuid4()),hash=claim['hash'])[0]==200
    export=admin('export')[1];backup=next(r for r in export['records'] if r['id']==ident)
    assert not any(key in json.dumps(export) for key in ['ticket','lease_token','notion_page_id'])
    bundle={'format':'dozang-backup','schema_version':1,'records':[backup]}
    assert admin('preview-import',bundle=bundle)[1]['missing']==0
    # Remove only our synthetic local fixture to simulate losing the database.
    query('DELETE FROM praise_stamps WHERE id=?',(ident,));query('DELETE FROM stamp_archive WHERE id=?',(ident,))
    assert admin('preview-import',bundle=bundle)[1]['missing']==1
    assert admin('import',bundle=bundle)[1]['imported']==1
    assert admin('import',bundle=bundle)[1]['imported']==0
    live=next(r for r in req('/api/stamps?board=second',method='GET')[1]['records'] if r['id']==ident)
    assert live['content']==content and live['day']==backup['day'] and live['created_at']==backup['created_at']
    # A deleted-only backup remains absent from the live board until explicitly restored.
    deleted_id=str(uuid.uuid4());ids.append(deleted_id)
    deleted={**backup,'id':deleted_id,'deleted_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    assert admin('import',bundle={**bundle,'records':[deleted]})[1]['imported']==1
    assert deleted_id not in {r['id'] for r in req('/api/stamps?board=second',method='GET')[1]['records']}
    assert admin('restore',id=deleted_id)[0]==200
    assert admin('preview-import',bundle={**bundle,'records':[{**backup,'board':'first'}]})[0]==400
    print('PASS: atomic archive/queue, job authorization and leases, failed backup retries, deletion during backup, original retention, trash restoration, loss recovery without overwrite, deleted import stays hidden')
finally:
    for ident in ids:
        for table in ['praise_stamps','stamp_archive','backup_jobs']:
            query(f'DELETE FROM {table} WHERE id=?',(ident,))

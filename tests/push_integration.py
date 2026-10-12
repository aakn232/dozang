"""Local-only API subscription controls and atomic stamp/outbox integration.
The local VAPID private key is deliberately invalid, so no provider is contacted.
"""
import json,sqlite3,subprocess,urllib.request,urllib.error,uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
BASE='http://127.0.0.1:8787'
def request(path,body=None,method=None):
    r=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Origin':BASE,'Content-Type':'application/json','Connection':'close'})
    try:response=urllib.request.urlopen(r,timeout=15)
    except urllib.error.HTTPError as e:response=e
    return response.status,json.loads(response.read())
paths=[p for p in Path('.wrangler/state/v3/d1').rglob('*.sqlite') if p.name!='metadata.sqlite'];assert len(paths)==1
def sql(query,args=()):
    with sqlite3.connect(paths[0]) as db:return db.execute(query,args).fetchall()
key=subprocess.check_output(['node','-e',"const c=require('crypto').createECDH('prime256v1');c.generateKeys();process.stdout.write(c.getPublicKey().toString('base64url'));"]).decode()
endpoint='https://fcm.googleapis.com/fcm/send/local-test-'+str(uuid.uuid4())
subscription={'endpoint':endpoint,'keys':{'p256dh':key,'auth':'AAAAAAAAAAAAAAAAAAAAAA'}}
ids=[str(uuid.uuid4()),str(uuid.uuid4())]
def call(action,board='first',s=subscription):return request('/api/push',{'action':action,'board':board,'subscription':s})
try:
    assert request('/api/push')[1]['configured'] is True
    assert request('/api/push/worker',{},'POST')[0]==401
    assert call('subscribe',s={**subscription,'endpoint':'https://127.0.0.1/private'})[0]==400
    assert call('status')[1]['enabled']=={'first':False,'second':False}
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda board:call('subscribe',board),['first','second']))
    assert call('status')[1]['enabled']=={'first':True,'second':True}
    assert call('disable')[1]['enabled']=={'first':False,'second':True}
    assert call('disable','second')[1]['enabled']=={'first':False,'second':False}
    assert call('subscribe')[1]['enabled']=={'first':True,'second':False}
    assert call('subscribe','second')[1]['enabled']=={'first':True,'second':True}
    wrong={**subscription,'keys':{**subscription['keys'],'auth':'AQEBAQEBAQEBAQEBAQEBAQ'}}
    assert call('disable',s=wrong)[0]==403
    for i,board in enumerate(['first','second']):
        body={'id':ids[i],'board':board,'content':'local push integration'}
        assert request('/api/stamps',body)[0]==200
        assert request('/api/stamps',body)[1]['alreadyAdded'] is True
        assert sql('SELECT COUNT(*) FROM push_events WHERE stamp_id=?',(ids[i],))[0][0]==1
        assert sql('SELECT COUNT(*) FROM push_deliveries WHERE stamp_id=?',(ids[i],))[0][0]==1
    assert call('disable')[1]['enabled']=={'first':False,'second':True}
    assert not sql('SELECT * FROM push_deliveries WHERE stamp_id=?',(ids[0],))
    assert call('disable','second')[1]['enabled']=={'first':False,'second':False}
    assert not sql('SELECT * FROM push_subscriptions WHERE endpoint=?',(endpoint,))
    assert call('status')[1]['enabled']=={'first':False,'second':False}
    public=request('/api/stamps?board=first')[1]
    assert endpoint not in json.dumps(public) and 'p256dh' not in json.dumps(public)
    print('PASS: subscription proof, provider validation, board controls, atomic outbox, duplicate retries, unsubscribe cancellation and public data isolation')
finally:
    sub_id=sql('SELECT id FROM push_subscriptions WHERE endpoint=?',(endpoint,))
    if sub_id:sql('DELETE FROM push_deliveries WHERE subscription_id=?',(sub_id[0][0],))
    sql('DELETE FROM push_subscriptions WHERE endpoint=?',(endpoint,))
    for ident in ids:
        for table in ['push_deliveries','push_events','backup_jobs','stamp_archive','praise_stamps']:
            field='stamp_id' if table.startswith('push_') else 'id'
            sql(f'DELETE FROM {table} WHERE {field}=?',(ident,))

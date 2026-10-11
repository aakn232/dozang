"""Local preview only: server validation of hidden-admin activation and past-date creation."""
import datetime
import json
import urllib.error
import urllib.request
import uuid

BASE = 'http://127.0.0.1:8787'

def request(path='/api/stamps', method='GET', body=None, origin=BASE):
    headers = {}
    if method != 'GET':
        headers['Origin'] = origin
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    req = urllib.request.Request(BASE+path,headers=headers,method=method,data=data)
    try:
        response = urllib.request.urlopen(req)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, json.loads(response.read()), response.headers

def state():
    status, data, _ = request()
    assert status == 200
    return data

def password(day):
    number = int(day[-2:])
    return str(sum(map(int,str(number))) * number)

initial = state()
today = initial['today']
yesterday = (datetime.date.fromisoformat(today)-datetime.timedelta(days=1)).isoformat()
future = (datetime.date.fromisoformat(today)+datetime.timedelta(days=1)).isoformat()
code = password(today)
ids=[]
try:
    assert request('/api/admin','POST',{'password':'0'})[0] == 403
    assert request('/api/admin','POST',{'password':code},origin='https://other.example')[0] == 403
    status, access, headers = request('/api/admin','POST',{'password':code})
    assert status == 200 and access['today'] == today
    assert 'password' not in access and headers.get('Set-Cookie') is None
    for body in [
        {'day':yesterday},
        {'day':yesterday,'admin':True},
        {'day':yesterday,'adminDay':today,'adminPassword':'0'},
        {'day':yesterday,'adminDay':yesterday,'adminPassword':code},
    ]:
        body['id']=str(uuid.uuid4())
        assert request(method='POST',body=body)[0]==401
    assert len(state()['records']) == len(initial['records'])
    for day in [future,'2026-02-30','2026-13-01',None]:
        assert request(method='POST',body={'id':str(uuid.uuid4()),'day':day,'adminDay':today,'adminPassword':code})[0]==400
    ident=str(uuid.uuid4())
    payload={'id':ident,'day':yesterday,'content':'어제의 잘한 일','adminDay':today,'adminPassword':code}
    status, data, _=request(method='POST',body=payload)
    assert status==200, data
    ids.append(ident)
    assert data['record']['day']==yesterday and data['record']['content']=='어제의 잘한 일'
    assert data['record']['created_at'].startswith(datetime.datetime.now(datetime.timezone.utc).date().isoformat())
    assert request(method='POST',body=payload)[1]['alreadyAdded']
    row=next(r for r in state()['records'] if r['id']==ident)
    assert row['day']==yesterday
    ordinary=str(uuid.uuid4())
    status, data, _=request(method='POST',body={'id':ordinary,'content':'오늘의 일반 도장'})
    assert status==200 and data['record']['day']==today
    ids.append(ordinary)
    assert len(state()['records'])==len(initial['records'])+2
    assert request(method='DELETE',body={'id':ident,'password':'0'})[0]==403
    assert any(r['id']==ident for r in state()['records'])
    print('PASS: hidden-admin password check, no cookies, wrong/stale credentials rejected, UI flags cannot bypass, valid past-date stamp, duplicate prevention, real/future date validation, ordinary today stamping, password deletion preserved')
finally:
    for ident in ids:
        assert request(method='DELETE',body={'id':ident,'password':password(state()['today'])})[0]==200

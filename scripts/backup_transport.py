"""One authenticated request. Secrets arrive on hidden stdin, never in argv or files."""
import json
from pathlib import Path
import sys
import termios
import urllib.error
import urllib.request

config = json.loads((Path(__file__).resolve().parents[1] / '.openai/backup.json').read_text())
base = 'http://127.0.0.1:8787' if '--local' in sys.argv else config['site_url']
settings = None
if sys.stdin.isatty():
    settings = termios.tcgetattr(sys.stdin)
    hidden = termios.tcgetattr(sys.stdin)
    hidden[3] &= ~termios.ECHO
    termios.tcsetattr(sys.stdin, termios.TCSANOW, hidden)
print('Ready for backup request JSON (hidden stdin).', flush=True)
try:
    args = json.loads(sys.stdin.readline())
    mode = args.get('mode', 'worker')
    if mode not in ('worker', 'admin'):
        raise ValueError('Invalid endpoint')
    headers = {'Content-Type':'application/json', 'Connection':'close', 'Origin':base}
    req = urllib.request.Request(base+'/api/backup/'+mode, method='POST', headers=headers, data=json.dumps(args['body']).encode())
    try:
        response = urllib.request.urlopen(req, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    result = {'status':response.status,'data':json.loads(response.read())}
    print(json.dumps(result, ensure_ascii=False), flush=True)
finally:
    if settings is not None:
        termios.tcsetattr(sys.stdin, termios.TCSANOW, settings)

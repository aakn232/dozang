'use client';
import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
import {BOARDS,type BoardId} from '../lib/stamps';
import {base64Bytes} from '../lib/push-format';
type Flags={first:boolean;second:boolean};
type State='loading'|'ready'|'install'|'unsupported'|'unconfigured';
export default function PushSettings({board}:{board:BoardId}) {
  const [state,setState]=useState<State>('loading'),[enabled,setEnabled]=useState<Flags>({first:false,second:false});
  const [publicKey,setPublicKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function call(action:string,subscription:PushSubscription):Promise<{enabled:Flags}> {
    const response=await fetch('/api/push',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,board,subscription:subscription.toJSON()})});
    const data=await response.json() as {enabled:Flags;error?:string};
    if(response.status===410){setEnabled({first:false,second:false});await subscription.unsubscribe().catch(()=>false);}
    if(!response.ok)throw new Error(data.error||'알림 연결에 실패했어요.');return data;
  }
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone;
      if(ios&&!standalone){setState('install');return;}
      if(!window.isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setState('unsupported');return;}
      try {
        const r=await fetch('/api/push',{cache:'no-store',credentials:'omit'}),config=await r.json() as {configured:boolean;publicKey:string};
        if(!r.ok||!config.configured){if(!cancelled)setState('unconfigured');return;}
        await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
        const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('알림 연결을 준비하지 못했어요. 새로고침해 주세요.')),10000))]);
        const subscription=await registration.pushManager.getSubscription();
        const flags=subscription?(await call('status',subscription)).enabled:{first:false,second:false};
        if(!cancelled){setPublicKey(config.publicKey);setEnabled(flags);setState('ready');}
      }catch(e){if(!cancelled){setError((e as Error).message);setState('unsupported');}}
    })();
    return()=>{cancelled=true;};
  // The component is remounted with each board; each request uses that board.
  },[board]);
  async function enable() {
    if(busy)return;setBusy(true);setError('');setMessage('');
    try {
      // Called directly by the user's tap before other asynchronous work, as iOS requires.
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error(permission==='denied'?'브라우저 또는 휴대폰 설정에서 커플도장의 알림을 허용해 주세요.':'알림을 받으려면 권한을 허용해 주세요.');
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64Bytes(publicKey).buffer as ArrayBuffer});
      setEnabled((await call('subscribe',subscription)).enabled);
      setMessage(`${BOARDS[board]}의 도장판에 새 칭찬이 등록되면 이 휴대폰에 알림이 와요.`);
    }catch(e){setError((e as Error).message||'알림을 켜지 못했어요. 다시 시도해 주세요.');}finally{setBusy(false);}
  }
  async function disable() {
    if(busy)return;setBusy(true);setError('');setMessage('');
    try {
      const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
      if(subscription){const flags=(await call('disable',subscription)).enabled;setEnabled(flags);if(!flags.first&&!flags.second)await subscription.unsubscribe();}
      else setEnabled({first:false,second:false});
      setMessage(`${BOARDS[board]}의 새 칭찬 알림을 껐어요.`);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function test() {
    if(busy)return;setBusy(true);setError('');setMessage('');
    try {
      const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
      if(!subscription)throw new Error('알림을 다시 켜 주세요.');
      await call('test',subscription);setMessage('테스트 알림을 요청했어요. 휴대폰의 알림창을 확인해 주세요.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <details className="push-settings">
    <summary><Bell size={16}/><span>새 칭찬 알림</span><span className={enabled[board]?'push-enabled':''}>{state==='loading'?'확인 중…':enabled[board]?'켜짐':'설정하기'}</span></summary>
    <div className="push-settings-body"><p><strong>{BOARDS[board]}의 도장판</strong>에 칭찬이 등록되면 이 휴대폰으로 알려드려요. 글 내용은 알림에 표시하지 않아요.</p>
      {state==='install'?<p>아이폰은 iOS 16.4 이상에서 사용할 수 있어요. <strong>Safari → 공유 → 홈 화면에 추가</strong>한 뒤, 홈 화면의 커플도장을 열어 알림을 켜 주세요.</p>:
       state==='unsupported'?<p>이 브라우저에서는 알림을 연결하지 못했어요. Chrome이나 Safari 최신 버전에서 열어 주세요. 아이폰은 홈 화면에 추가한 앱에서 사용할 수 있어요.</p>:
       state==='unconfigured'?<p>알림 기능을 준비 중이에요. 잠시 후 다시 열어 주세요.</p>:
       <div className="push-actions">{enabled[board]?<><button type="button" disabled={busy} onClick={()=>void disable()}>이 도장판 알림 끄기</button><button type="button" disabled={busy} onClick={()=>void test()}>테스트 알림</button></>:<button type="button" disabled={busy||state==='loading'} onClick={()=>void enable()}>{BOARDS[board]} 알림 켜기</button>}</div>}
      <p className="push-help">상대방도 자기 휴대폰에서 받고 싶은 도장판의 알림을 켜면 돼요. 앱을 열어두지 않아도 받을 수 있어요.</p>
      {busy&&<p role="status">알림 설정을 처리 중이에요…</p>}{message&&<p role="status">{message}</p>}{error&&<p className="push-error" role="alert">{error}</p>}
    </div>
  </details>;
}

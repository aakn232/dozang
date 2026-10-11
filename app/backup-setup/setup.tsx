'use client';
import { useState } from 'react';
import styles from './setup.module.css';
const secrets='https://github.com/aakn232/dozang/settings/secrets/actions';
export default function Setup() {
  const [secret,setSecret]=useState(''),[error,setError]=useState(''),[copied,setCopied]=useState(false),[busy,setBusy]=useState(false);
  async function copy() {
    setBusy(true);setError('');setCopied(false);
    try {
      const response=await fetch('/api/backup/setup',{cache:'no-store'}),data=await response.json() as {secret:string;error?:string};
      if(!response.ok)throw new Error(data.error||'연결 설정을 읽지 못했어요.');
      setSecret(data.secret);
      try{await navigator.clipboard.writeText(data.secret);setCopied(true);}catch{/* Manual copy is available below. */}
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <main className={styles.setup} style={{maxWidth:620,margin:'0 auto',padding:'28px 20px',lineHeight:1.8,overflowWrap:'anywhere'}}>
    <a href="/">← 커플도장</a><h1 style={{fontSize:26,marginTop:20}}>자동 백업 연결</h1>
    <p>백업은 GitHub 서버에서 실행해요. ChatGPT 예약이나 열린 브라우저가 필요하지 않아요. 이 설정 화면만 소유자 로그인으로 보호해요.</p>
    <ol style={{paddingLeft:24}}>
      <li><a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">Notion 내부 통합</a>을 만들고 읽기·삽입·업데이트를 허용하세요. <a href="https://app.notion.com/p/3f6acaa3fa8481d58b4bfd6a6c10fa01" target="_blank" rel="noreferrer">커플도장 백업 페이지</a>의 연결에 이 통합을 추가하세요.</li>
      <li><a href={secrets} target="_blank" rel="noreferrer">GitHub 보안 설정</a>에서 <strong>New repository secret</strong>을 선택하세요. 이름은 <code>NOTION_API_TOKEN</code>, 값은 Notion에서 발급받은 키로 저장하세요.</li>
      <li>아래 연결 값을 복사해 같은 GitHub 화면에 이름 <code>DOZANG_BACKUP_CONFIG</code>로 하나 더 저장하세요.</li>
    </ol>
    <button type="button" disabled={busy} onClick={()=>void copy()} style={{minHeight:48,padding:'12px 20px',borderRadius:12,background:'#723a57',color:'#fff',border:0,fontSize:16}}>{busy?'준비 중…':'GitHub 연결 값 복사'}</button>
    {copied&&<p role="status">복사했어요. DOZANG_BACKUP_CONFIG의 Secret 칸에 붙여 넣으세요.</p>}
    {secret&&<><label htmlFor="backup-secret" style={{display:'block',marginTop:16}}>직접 복사할 연결 값</label><textarea id="backup-secret" readOnly value={secret} onFocus={e=>e.currentTarget.select()} spellCheck={false} style={{width:'100%',minHeight:120,fontSize:16,boxSizing:'border-box'}}/><p>이 값은 채팅이나 저장소 파일에 올리지 마세요. GitHub의 Secret 칸에만 등록하세요.</p></>}
    {error&&<p role="alert">{error}</p>}
    <p>두 값을 저장하면 <a href="https://github.com/aakn232/dozang/actions/workflows/notion-backup.yml" target="_blank" rel="noreferrer">Notion backup 작업</a>에서 <strong>Run workflow</strong>로 첫 실행을 시작할 수 있어요. 이후 매시간 자동 실행하며, 결과는 사이트 관리자 모드에서도 확인할 수 있어요.</p>
    <p>GitHub 예약은 지연될 수 있고, 공개 저장소에 60일간 활동이 없으면 자동 중지될 수 있어요. 백업 상태의 최근 실행 시각을 확인해 주세요.</p>
  </main>;
}

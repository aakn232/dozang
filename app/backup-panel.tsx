'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BOARDS, type BoardId } from '../lib/stamps';
import type { BackupBundle } from '../lib/backup-format';
type Status = {stats:{completed:number;pending:number;failed:number;last_success:string|null;oldest_pending:string|null};deleted:{id:string;day:string;content:string;deleted_at:string}[]};
const formatTime=(value:string|null)=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'아직 없음';

export default function BackupPanel({board,password,onRestore}:{board:BoardId;password:string;onRestore:()=>Promise<void>}) {
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [preview,setPreview]=useState<{missing:number;skipped:number;deleted:number}|null>(null);
  const bundle=useRef<BackupBundle|null>(null),fileInput=useRef<HTMLInputElement>(null);
  const call=useCallback(async<T=unknown,>(action:string,extra:Record<string,unknown>={}):Promise<T>=>{
    const response=await fetch('/api/backup/admin',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,board,password,...extra})});
    const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'백업 작업을 처리하지 못했습니다.');return data as T;
  },[board,password]);
  const refresh=useCallback(async()=>{try{setStatus(await call<Status>('status'));setError('');}catch(e){setError((e as Error).message);}},[call]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);return()=>clearInterval(timer);},[refresh]);
  async function run(work:()=>Promise<void>) {if(busy)return;setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function download() {await run(async()=>{const data=await call('export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`커플도장-${BOARDS[board]}-백업.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('백업 파일을 내려받았어요. 삭제한 도장도 포함되어 있어요.');});}
  async function selectFile(file:File|undefined) {
    bundle.current=null;setPreview(null);if(!file)return;
    await run(async()=>{if(file.size>12_000_000)throw new Error('12MB 이하의 백업 파일을 선택해 주세요.');const data=JSON.parse(await file.text());setPreview(await call<{missing:number;skipped:number;deleted:number}>('preview-import',{bundle:data}));bundle.current=data;});
  }
  return <section className="backup-panel" aria-label="백업과 복원">
    <h3>백업과 복원</h3>
    <p>{BOARDS[board]}의 기록을 Notion에 1시간마다 백업해요.</p>
    {status&&<><dl><div><dt>백업 완료</dt><dd>{status.stats.completed||0}개</dd></div><div><dt>대기</dt><dd>{status.stats.pending||0}개</dd></div><div><dt>오류</dt><dd>{status.stats.failed||0}개</dd></div></dl><p>최근 완료: {formatTime(status.stats.last_success)}</p></>}
    <div className="backup-actions"><button type="button" disabled={busy} onClick={()=>void refresh()}>상태 새로고침</button><button type="button" disabled={busy} onClick={()=>void download()}>백업 파일 저장</button></div>
    <details><summary>삭제한 도장 복원</summary><p>삭제한 도장은 여기에서 복원할 수 있어요.</p>
      {!status?.deleted.length?<p>삭제한 도장이 없어요.</p>:<ul className="backup-trash">{status.deleted.map(r=><li key={r.id}><div><strong>{r.day}</strong><p>{r.content||'내용 없는 도장'}</p></div><button type="button" disabled={busy} onClick={()=>void run(async()=>{await call('restore',{id:r.id});await refresh();await onRestore();setMessage('도장을 복원했어요. Notion 상태도 다음 백업에서 갱신됩니다.');})}>복원</button></li>)}</ul>}
    </details>
    <details><summary>백업 파일로 복원</summary><p>{BOARDS[board]}의 JSON 백업 파일을 선택해 주세요. 기존 기록은 덮어쓰지 않고, 삭제된 기록은 휴지통에 복원해요.</p><input ref={fileInput} type="file" accept=".json,application/json" disabled={busy} aria-label="복원할 백업 파일" onChange={e=>void selectFile(e.target.files?.[0])}/>
      {preview&&<div className="import-preview"><p>복원할 기록 {preview.missing}개 (삭제됨 {preview.deleted}개) · 기존 기록 {preview.skipped}개 유지</p><button type="button" disabled={busy||!preview.missing} onClick={()=>void run(async()=>{const result=await call<{imported:number}>('import',{bundle:bundle.current});setPreview(null);bundle.current=null;if(fileInput.current)fileInput.current.value='';await refresh();await onRestore();setMessage(`${result.imported}개의 기록을 복원했어요.`);})}>{busy?'복원 중…':'확인하고 복원'}</button></div>}
    </details>
    {busy&&<p role="status">처리 중이에요…</p>}{error&&<p className="delete-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}

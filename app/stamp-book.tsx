'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Stamp, Grid2X2, List, RefreshCw, Trash2, X, Plus, ArrowUpRight } from 'lucide-react';
import { koreaDay, stampOrder, MAX_STAMP_CONTENT_LENGTH, BOARDS, type BoardId, type StampRecord } from '../lib/stamps';
import BackupPanel from './backup-panel';
import PushSettings from './push-settings';

type ApiResponse = {
  error?: string; records: StampRecord[]; record: StampRecord; today: string; alreadyAdded?: boolean;
};
const formatDate = (day: string) => `${day.slice(0,4)}년 ${Number(day.slice(5,7))}월 ${Number(day.slice(8))}일`;

export default function StampBook({ initialDay, initialBoard }: { initialDay: string; initialBoard: BoardId }) {
  const [board, setBoard] = useState(initialBoard);
  const [drafts, setDrafts] = useState<Record<BoardId, string>>({ first: '', second: '' });
  function switchBoard(next: BoardId) {
    const url = new URL(window.location.href);
    url.searchParams.set('board', next);
    url.searchParams.delete('stamp');
    window.history.replaceState(null, '', url);
    setBoard(next);
  }
  return <PartnerBoard key={board} initialDay={initialDay} board={board} onSwitch={switchBoard} content={drafts[board]} setContent={value => setDrafts(previous => ({...previous, [board]: value}))} />;
}

function PartnerBoard({ initialDay, board, onSwitch, content, setContent }: {
  initialDay: string; board: BoardId; onSwitch: (board: BoardId) => void;
  content: string; setContent: (value: string) => void;
}) {
  const boardName = BOARDS[board];
  const [records, setRecords] = useState<StampRecord[]>([]);
  const [today, setToday] = useState(initialDay);
  const [month, setMonth] = useState(initialDay.slice(0,7));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState('calendar');
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [saveError, setSaveError] = useState('');
  const [celebration, setCelebration] = useState('');
  const savedFocusPending = useRef(false);
  const composerTrigger = useRef<HTMLElement | null>(null);
  const composerDialog = useRef<HTMLDialogElement>(null);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<StampRecord | null>(null);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const mutationPending = useRef(false);
  const mutationRevision = useRef(0);
  const pendingAdd = useRef<{id: string; content: string; day: string} | null>(null);
  const [adminAccess, setAdminAccess] = useState<{password: string; day: string} | null>(null);
  const [stampDay, setStampDay] = useState(initialDay);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const adminDialog = useRef<HTMLDialogElement>(null);
  const adminInput = useRef<HTMLInputElement>(null);
  const logoTaps = useRef({ count: 0, last: 0 });
  const notificationOpened=useRef(false);
  const adminActive = adminAccess !== null && adminAccess.day === today;

  const load = useCallback(async (quiet = false) => {
    const revision = mutationRevision.current;
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const response = await fetch(`/api/stamps?board=${board}`, { cache: 'no-store', credentials: 'omit' });
      const data = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(data.error);
      if (revision !== mutationRevision.current) return;
      setRecords(data.records); setToday(data.today);
      setAdminAccess(access => access?.day === data.today ? access : null);
      setError('');
    } catch (err) {
      if (revision === mutationRevision.current) setError(err instanceof Error ? err.message : '도장을 불러오지 못했습니다.');
    } finally { if (!quiet) setLoading(false); }
  }, [board]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  useEffect(()=>{
    if(loading||notificationOpened.current)return;
    const id=new URL(window.location.href).searchParams.get('stamp');
    const record=records.find(r=>r.id===id);
    if(!record)return;
    notificationOpened.current=true;setMonth(record.day.slice(0,7));setSelectedDay(record.day);setView('calendar');
    const timer=setTimeout(()=>document.getElementById('stamp-'+record.id)?.scrollIntoView({block:'center'}),100);
    return()=>clearTimeout(timer);
  },[records,loading]);
  useEffect(() => {
    const sync = () => { if (document.visibilityState === 'visible' && !mutationPending.current) void load(true); };
    document.addEventListener('visibilitychange', sync);
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && !mutationPending.current) void load(true); }, 15000);
    return () => { document.removeEventListener('visibilitychange', sync); clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    if (!saving && savedFocusPending.current) {
      savedFocusPending.current = false;
      composerDialog.current?.close();
      composerTrigger.current?.focus({ preventScroll: true });
    }
  }, [saving]);

  async function addStamp(event: FormEvent) {
    event.preventDefault();
    if (mutationPending.current) return;
    mutationPending.current = true;
    mutationRevision.current++;
    setSaving(true); setMessage(''); setSaveError('');
    try {
      const day = adminActive ? stampDay : today;
      if (!pendingAdd.current || pendingAdd.current.content !== content || pendingAdd.current.day !== day) {
        pendingAdd.current = { id: crypto.randomUUID(), content, day };
      }
      const response = await fetch('/api/stamps', {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({...pendingAdd.current, board, ...(adminActive ? {adminPassword:adminAccess.password,adminDay:adminAccess.day} : {})}),
      });
      const data = await response.json() as ApiResponse;
      if (!response.ok) {
        if (response.status === 401) setAdminAccess(null);
        throw new Error(data.error);
      }
      setRecords(previous => [data.record, ...previous.filter(r => r.id !== data.record.id)].sort(stampOrder));
      setToday(data.today); setMonth(data.record.day.slice(0,7));
      setContent(''); pendingAdd.current = null;
      setSelectedDay(data.record.day); setView('calendar');
      setCelebration(data.record.id); savedFocusPending.current = true;
      setMessage(`${boardName} 도장판의 ${formatDate(data.record.day)}에 잘했어요! 도장 하나를 추가했어요.`);
    } catch (err) { setSaveError(err instanceof Error ? err.message : '도장을 저장하지 못했습니다.'); }
    finally { setSaving(false); mutationPending.current = false; }
  }

  function tapLogo() {
    const now = Date.now();
    logoTaps.current.count = now - logoTaps.current.last <= 3000 ? logoTaps.current.count + 1 : 1;
    logoTaps.current.last = now;
    if (logoTaps.current.count < 5 || mutationPending.current || unlocking) return;
    logoTaps.current.count = 0;
    if (adminActive) { openComposer(); return; }
    setAdminPassword(''); setAdminError('');
    adminDialog.current?.showModal(); adminInput.current?.focus();
  }
  function closeAdminDialog() {
    if (unlocking) return;
    adminDialog.current?.close(); setAdminPassword(''); setAdminError('');
  }
  async function unlockAdmin(event: FormEvent) {
    event.preventDefault();
    if (unlocking) return;
    setUnlocking(true); setAdminError('');
    try {
      const response = await fetch('/api/admin', {method:'POST', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:adminPassword})});
      const data = await response.json() as {error?:string;today:string};
      if (!response.ok) throw new Error(data.error);
      setToday(data.today); setStampDay(data.today);
      setAdminAccess({password:adminPassword,day:data.today});
      setAdminPassword(''); adminDialog.current?.close();
      setMessage('관리자 모드가 열렸어요. 도장 날짜를 선택해 주세요.');
    } catch (err) { setAdminError(err instanceof Error ? err.message : '관리자 모드를 열지 못했습니다.'); }
    finally { setUnlocking(false); }
  }
  function leaveAdmin() {
    setAdminAccess(null); setStampDay(today); pendingAdd.current = null;
    setMessage('관리자 모드를 종료했어요. 오늘 날짜로 도장이 추가됩니다.');
  }

  function openDelete(record: StampRecord) {
    setDeleteTarget(record); setPassword(''); setDeleteError('');
    dialog.current?.showModal();
    passwordInput.current?.focus();
  }
  function closeDelete() {
    if (mutationPending.current) return;
    dialog.current?.close(); setDeleteTarget(null); setPassword(''); setDeleteError('');
  }
  async function removeStamp(event: FormEvent) {
    event.preventDefault();
    if (!deleteTarget || mutationPending.current) return;
    mutationPending.current = true; mutationRevision.current++; setDeleting(true); setDeleteError(''); setMessage('');
    try {
      const response = await fetch('/api/stamps', {
        method: 'DELETE', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id, password, board }),
      });
      const data = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(data.error);
      setRecords(previous => previous.filter(record => record.id !== deleteTarget.id));
      setToday(data.today); setMessage('선택한 도장 하나를 없앴어요.');
      dialog.current?.close(); setDeleteTarget(null); setPassword('');
    } catch (err) { setDeleteError(err instanceof Error ? err.message : '도장을 없애지 못했습니다.'); }
    finally { setDeleting(false); mutationPending.current = false; }
  }
  function moveMonth(delta: number) {
    const [year, mon] = month.split('-').map(Number);
    const nextMonth = new Date(Date.UTC(year, mon - 1 + delta, 1)).toISOString().slice(0,7);
    setMonth(nextMonth);
    setSelectedDay(nextMonth === today.slice(0,7) ? today : records.find(record => record.day.startsWith(nextMonth))?.day ?? `${nextMonth}-01`);
  }
  function showDay(day: string) { setSelectedDay(day); }
  function openComposer() {
    setSaveError(''); composerTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; composerDialog.current?.showModal();
    // Keep the sheet overview visible on phones; focus can move to the text field naturally.
  }
  function closeComposer() { if (!saving) composerDialog.current?.close(); }
  const [year, mon] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const monthRecords = records.filter(record => record.day.startsWith(month));
  const visibleRecords = view === 'calendar' ? records.filter(record => record.day === selectedDay) : records;
  const dayCounts = new Map<string, number>();
  for (const record of records) dayCounts.set(record.day, (dayCounts.get(record.day) ?? 0) + 1);

  return <div className={`stamp-app board-${board}`}>
    <header className="site-header">
      <button className="brand" type="button" onClick={tapLogo} aria-label="커플도장"><span className="brand-mark" aria-hidden="true"><Seal small /></span><span>커플도장</span></button>
      <span className="couple-name">기훈 <span aria-hidden="true">&</span> 빛나</span>
    </header>
    <main className="notebook-main">
      <section className="intro" aria-labelledby="book-title">
        <div><p className="intro-note">우리 둘의 칭찬 노트</p><h1 id="book-title">서로에게, <span>잘했어요!</span></h1><p className="intro-description">작은 노력도, 다정한 마음도 오래 기억해요.</p></div>
        <div className="intro-seal" aria-hidden="true"><Seal /></div>
      </section>
      <PushSettings board={board}/>
      <div className="book-toolbar">
        <section className="couple-switch" aria-label="도장판 전환">
          {(Object.keys(BOARDS) as BoardId[]).map(id => <button key={id} type="button" className={board === id ? 'active' : ''} aria-pressed={board === id} disabled={saving || deleting || unlocking} onClick={() => onSwitch(id)}><span className={`partner-dot dot-${id}`} aria-hidden="true" />{BOARDS[id]}의 도장판</button>)}
        </section>
        <button className="primary toolbar-compose" type="button" onClick={openComposer} disabled={loading || saving || deleting}><Plus size={18} />칭찬 도장 찍기</button>
      </div>
      <section className="notebook" aria-label={`${boardName}의 칭찬 기록`}>
        <div className="book-heading">
          <div className="board-summary"><h2>{boardName}에게 모인 마음</h2><p>모은 도장 <strong>{loading ? '—' : records.length}</strong><span aria-hidden="true">·</span>오늘 <strong>{loading ? '—' : dayCounts.get(today) ?? 0}</strong></p></div>
          <div className="view-switch" aria-label="도장 보기 방식"><button aria-pressed={view === 'calendar'} className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><Grid2X2 size={15} /><span>달력</span></button><button aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={17} /><span>전체 도장</span></button></div>
        </div>
        {error && <div className="error" role="alert"><span>{error}</span><button onClick={() => void load()}><RefreshCw size={15} />다시 불러오기</button></div>}
        <div className="feedback" aria-live="polite" aria-atomic="true">{message && <p className="success" key={message}><Stamp size={17} />{message}</p>}</div>
        {loading ? <div className="loading-state" role="status"><div className="loading-calendar" aria-hidden="true">{Array.from({length:28},(_,i)=><span key={i}/>)}</div><p>칭찬 노트를 펼치고 있어요…</p></div> : error && records.length === 0 ? <div className="empty"><h4>칭찬 노트를 불러오지 못했어요</h4><p>연결을 확인하고 위의 다시 불러오기를 눌러 주세요.</p></div> : <div className={`book-pages ${view === 'list' ? 'list-view' : ''}`}>
          {view === 'calendar' && <section className="calendar-pane" aria-label="월별 칭찬 달력">
            <div className="month-nav"><div className="month-title"><span>{year}</span><h3>{mon}<small>월</small></h3></div><div className="month-actions"><button onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft size={20} /></button><button className="this-month" onClick={() => {setMonth(today.slice(0,7));setSelectedDay(today);}}>이번 달</button><button onClick={() => moveMonth(1)} disabled={month >= today.slice(0,7)} aria-label="다음 달"><ChevronRight size={20} /></button></div></div>
            <div className="calendar"><div className="weekdays">{['일','월','화','수','목','금','토'].map(day => <span key={day}>{day}</span>)}</div>
              <div className="dates">
                {Array.from({ length: first }, (_, i) => <div key={`pad${i}`} className="day blank" aria-hidden="true" />)}
                {Array.from({ length: count }, (_, i) => {
                  const day = `${month}-${String(i + 1).padStart(2,'0')}`;
                  const amount = dayCounts.get(day) ?? 0, isToday = day === today;
                  return <button key={day} type="button" className={`day ${isToday ? 'today ' : ''}${amount ? 'done ' : ''}${day > today ? 'future ' : ''}${selectedDay === day ? 'selected' : ''}`} disabled={day > today} onClick={() => showDay(day)} aria-pressed={selectedDay === day} aria-current={isToday ? 'date' : undefined} aria-label={`${formatDate(day)}${isToday ? ', 오늘' : ''}, 칭찬 도장 ${amount}개`}><span className="day-number">{i + 1}</span>{amount ? <span className="mini-stamp" aria-hidden="true"><Seal small /><b>{amount}</b></span> : isToday ? <span className="today-label">오늘</span> : null}</button>;
                })}
                {Array.from({length:(7-(first+count)%7)%7},(_,i)=><div key={`end${i}`} className="day blank" aria-hidden="true" />)}
              </div>
            </div>
            <div className="calendar-footer"><span>이달의 칭찬 <strong>{monthRecords.length}개</strong></span><span>날짜를 눌러 마음을 꺼내 봐요</span></div>
          </section>}
          <section className="detail-pane" aria-labelledby="detail-title">
            <div className="detail-heading"><div><p className="detail-kicker">{view === 'calendar' ? '이날의 칭찬' : '차곡차곡 모은 칭찬'}</p><h3 id="detail-title">{view === 'calendar' ? `${Number(selectedDay.slice(5,7))}월 ${Number(selectedDay.slice(8))}일` : '우리의 칭찬 기록'}{view === 'calendar' && selectedDay === today && <span>오늘</span>}</h3></div><span className="detail-count">{visibleRecords.length}개</span></div>
            {visibleRecords.length === 0 ? <div className="empty"><span className="empty-seal" aria-hidden="true"><Seal /></span><h4>{records.length === 0 ? '첫 칭찬을 기다리는 중' : '아직 찍힌 도장이 없어요'}</h4><p>{records.length === 0 ? '고마웠던 순간, 잘해낸 일을\n도장 하나로 남겨 주세요.' : '매일 채우지 않아도 괜찮아요.\n칭찬하고 싶은 순간에 찍어 주세요.'}</p>{(selectedDay === today || view === 'list') && <button className="text-action" type="button" onClick={() => {setStampDay(today);openComposer();}}>오늘의 칭찬 남기기<ArrowUpRight size={16} /></button>}</div> : <ul className="stamp-history">{visibleRecords.map(record => <li key={record.id} id={'stamp-'+record.id} className={celebration === record.id ? 'fresh-stamp' : ''}>
              <div className="record-top"><span className="record-seal" aria-hidden="true"><Seal small /></span><div><strong>잘했어요!</strong><time dateTime={record.created_at}>{view === 'list' ? `${record.day.replaceAll('-', '. ')} · ` : ''}{koreaDay(new Date(record.created_at)) === record.day ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }).format(new Date(record.created_at)) : `${formatDate(koreaDay(new Date(record.created_at)))}에 추가`}</time></div><button type="button" className="remove-stamp" disabled={saving || deleting} onClick={() => openDelete(record)} aria-label={`${formatDate(record.day)} 도장 없애기`}><Trash2 size={16} /></button></div>
              {record.content ? <p className="stamp-content">{record.content}</p> : <p className="wordless-stamp">말 대신 도장으로 전한 칭찬</p>}
            </li>)}</ul>}
          </section>
        </div>}
      </section>
      {adminActive && <section className="admin-workspace"><div className="admin-mode-bar"><span>관리자 모드가 켜져 있어요</span><button type="button" onClick={openComposer}>지난 날짜에 도장 찍기</button><button type="button" onClick={leaveAdmin} disabled={saving}>종료</button></div><BackupPanel board={board} password={adminAccess.password} onRestore={()=>load(true)} /></section>}
      <p className="notebook-caption">잘한 일은 작아도, 남겨 둔 마음은 오래가니까.</p>
    </main>
    <footer className="site-footer"><span>기훈과 빛나의 칭찬 노트</span><span>한국 시간 기준</span></footer>
    <div className="mobile-compose"><button className="primary" type="button" onClick={openComposer} disabled={loading || saving || deleting}><Plus size={20} /><span>칭찬 도장 찍기</span><span className="compose-recipient">{boardName}에게</span></button></div>
    <dialog ref={composerDialog} className="composer-dialog" aria-labelledby="composer-title" onCancel={event => {if(saving) event.preventDefault();}}>
      <div className="sheet-handle" aria-hidden="true" />
      <div className="dialog-heading"><p className="dialog-note">{boardName}에게 주는 마음</p><button type="button" onClick={closeComposer} disabled={saving} aria-label="칭찬 작성 닫기"><X size={22} /></button></div>
      <div className="composer-title"><div><h2 id="composer-title">어떤 일을 잘했나요?</h2><p>{formatDate(adminActive ? stampDay : today)}<span>하루에 여러 번도 좋아요</span></p></div><span aria-hidden="true"><Seal /></span></div>
      <form className="stamp-composer" onSubmit={addStamp}>
        {adminActive && <section className="admin-panel" aria-label="관리자 날짜 선택"><div className="admin-panel-heading"><strong>관리자 모드</strong><button type="button" onClick={leaveAdmin} disabled={saving}>종료</button></div><label htmlFor="stamp-day">도장 날짜</label><input id="stamp-day" type="date" value={stampDay} max={today} onChange={event => setStampDay(event.target.value)} required disabled={saving} /><p>오늘 또는 지난 날짜에 도장을 추가할 수 있어요.</p></section>}
        <div className="content-label"><label htmlFor="stamp-content">칭찬 한마디 <span>선택</span></label><span id="content-count">{content.length.toLocaleString('ko-KR')} / {MAX_STAMP_CONTENT_LENGTH.toLocaleString('ko-KR')}</span></div>
        <textarea ref={contentInput} id="stamp-content" name="content" maxLength={MAX_STAMP_CONTENT_LENGTH} rows={5} placeholder="오늘 고마웠던 일, 잘해낸 일을 적어 주세요." value={content} onChange={event => setContent(event.target.value)} disabled={saving} aria-describedby="content-help content-count" />
        <p id="content-help" className="content-help">내용 없이 도장만 찍어도 좋아요. 적은 내용은 방문자 모두에게 보여요.</p>
        {saveError && <div className="error composer-error" role="alert">{saveError} 작성한 내용은 그대로 있어요. 다시 찍어 주세요.</div>}
        <button className="primary" type="submit" disabled={loading || saving || deleting}><Stamp size={20} />{saving ? '마음을 남기는 중…' : '잘했어요! 도장 찍기'}</button>
      </form>
    </dialog>
    <dialog ref={adminDialog} className="delete-dialog admin-dialog" aria-labelledby="admin-title" onCancel={event => { if (unlocking) event.preventDefault(); else {setAdminPassword('');setAdminError('');} }}>
      <form onSubmit={unlockAdmin}>
        <div className="dialog-heading"><h2 id="admin-title">관리자 모드</h2><button type="button" onClick={closeAdminDialog} disabled={unlocking} aria-label="닫기"><X size={20} /></button></div>
        <p>비밀번호를 확인하면 지난 날짜에 도장을 추가할 수 있어요.</p>
        <label htmlFor="admin-password">오늘의 비밀번호</label>
        <input ref={adminInput} id="admin-password" type="password" inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} autoComplete="off" value={adminPassword} onChange={event => setAdminPassword(event.target.value)} required disabled={unlocking} aria-describedby="admin-help" />
        <p id="admin-help" className="password-help">한국 시간 기준 오늘 날짜로 계산한 비밀번호를 입력해 주세요.</p>
        {adminError && <p className="delete-error" role="alert">{adminError}</p>}
        <div className="dialog-actions"><button className="cancel-delete" type="button" onClick={closeAdminDialog} disabled={unlocking}>취소</button><button className="unlock-admin" type="submit" disabled={unlocking || !adminPassword}>{unlocking ? '확인 중…' : '활성화'}</button></div>
      </form>
    </dialog>
    <dialog ref={dialog} className="delete-dialog" aria-labelledby="delete-title" onCancel={event => { if (deleting) event.preventDefault(); else { setDeleteTarget(null); setPassword(''); setDeleteError(''); } }}>
      <form onSubmit={removeStamp}>
        <div className="dialog-heading"><h2 id="delete-title">도장 없애기</h2><button type="button" onClick={closeDelete} disabled={deleting} aria-label="닫기"><X size={20} /></button></div>
        <p>{deleteTarget ? `${boardName} 도장판에서 ${formatDate(deleteTarget.day)}의 “잘했어요!” 도장 하나를 없앱니다.` : '선택한 도장 하나를 없앱니다.'} 삭제한 도장은 관리자 모드에서 복원할 수 있어요.</p>
        {deleteTarget?.content && <blockquote className="delete-content">{deleteTarget.content}</blockquote>}
        <label htmlFor="delete-password">오늘의 비밀번호</label>
        <input ref={passwordInput} id="delete-password" type="password" inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} required disabled={deleting} aria-describedby="password-help" />
        <p id="password-help" className="password-help">한국 시간 기준 오늘 날짜로 계산한 비밀번호를 입력해 주세요.</p>
        {deleteError && <p className="delete-error" role="alert">{deleteError}</p>}
        <div className="dialog-actions"><button className="cancel-delete" type="button" disabled={deleting} onClick={closeDelete}>취소</button><button className="confirm-delete" type="submit" disabled={deleting || !password}>{deleting ? '없애는 중…' : '도장 없애기'}</button></div>
      </form>
    </dialog>
  </div>;
}

function Seal({ small = false }: { small?: boolean }) {
  return <svg className={`seal ${small ? 'seal-small' : ''}`} viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d="M50 4.5 58 7l8.5-.3 6.8 5.1 8.1 2.5 4.8 7.1 6.3 5.7 1.7 8.4 3.5 7.7-1.7 8.4.5 8.5-4.8 7-2.3 8.2-7 4.9-5.5 6.5-8.3 1.9-7.7 3.7-8.4-1.5-8.5.7-7.1-4.6-8.2-2.1-5.1-6.9-6.6-5.3-2.1-8.3-3.9-7.5 1.3-8.4-1-8.5 4.5-7.3 1.9-8.2 6.7-5.3 5.2-6.7 8.2-2.3L50 4.5Z" fill="currentColor" opacity=".055" />
    <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="1.6" strokeDasharray="119 2 51 2 95 7" /><circle cx="50" cy="50" r="38.5" stroke="currentColor" strokeWidth=".8" />
    <path d="m50 20 4.4 9 9.9 1.5-7.2 7 1.7 9.8-8.8-4.6-8.8 4.6 1.7-9.8-7.2-7 9.9-1.5L50 20Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    {small ? <path d="m33 61 11 10 23-19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : <><text x="50" y="65" textAnchor="middle" fill="currentColor" fontSize="15" fontWeight="700">잘했어요!</text><path d="M34 75c10 3 21 3 32-1" stroke="currentColor" strokeLinecap="round" /></>}
  </svg>;
}

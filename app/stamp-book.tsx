'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Stamp, Star, Grid2X2, List, RefreshCw, Trash2, X } from 'lucide-react';
import { koreaDay, type StampRecord } from '../lib/stamps';

type ApiResponse = {
  error?: string; records: StampRecord[]; record: StampRecord; today: string; alreadyAdded?: boolean;
};
const formatDate = (day: string) => `${day.slice(0,4)}년 ${Number(day.slice(5,7))}월 ${Number(day.slice(8))}일`;

export default function StampBook({ initialDay }: { initialDay: string }) {
  const [records, setRecords] = useState<StampRecord[]>([]);
  const [today, setToday] = useState(initialDay);
  const [month, setMonth] = useState(initialDay.slice(0,7));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState('calendar');
  const [selectedDay, setSelectedDay] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StampRecord | null>(null);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const mutationPending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/stamps', { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(data.error);
      setRecords(data.records); setToday(data.today);
    } catch (err) {
      setError(err instanceof Error ? err.message : '도장을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    const sync = () => { if (document.visibilityState === 'visible' && !mutationPending.current) void load(); };
    document.addEventListener('visibilitychange', sync);
    const timer = setInterval(() => { if (koreaDay() !== today && !mutationPending.current) void load(); }, 30000);
    return () => { document.removeEventListener('visibilitychange', sync); clearInterval(timer); };
  }, [load, today]);

  async function addStamp() {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/stamps', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crypto.randomUUID() }),
      });
      const data = await response.json() as ApiResponse;
      if (!response.ok) throw new Error(data.error);
      setRecords(previous => [data.record, ...previous.filter(r => r.id !== data.record.id)]);
      setToday(data.today); setMonth(data.today.slice(0,7));
      setMessage('잘했어요! 칭찬 도장 하나를 찍었어요.');
    } catch (err) { setError(err instanceof Error ? err.message : '도장을 저장하지 못했습니다.'); }
    finally { setSaving(false); mutationPending.current = false; }
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
    mutationPending.current = true; setDeleting(true); setDeleteError(''); setMessage('');
    try {
      const response = await fetch('/api/stamps', {
        method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id, password }),
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
    setMonth(new Date(Date.UTC(year, mon - 1 + delta, 1)).toISOString().slice(0,7));
  }
  function showDay(day: string) { setSelectedDay(day); setView('list'); }
  const [year, mon] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const monthRecords = records.filter(record => record.day.startsWith(month));
  const visibleRecords = selectedDay ? records.filter(record => record.day === selectedDay) : records;
  const dayCounts = new Map<string, number>();
  for (const record of records) dayCounts.set(record.day, (dayCounts.get(record.day) ?? 0) + 1);

  return <>
    <header>
      <Link className="brand" href="/" aria-label="도장 홈"><span className="brand-mark"><Stamp size={22} /></span>도장<span className="brand-en">dozang</span></Link>
      <div className="account"><span>나의 칭찬 수첩</span></div>
    </header>
    <main>
      <div className="intro"><p className="eyebrow">MY PRAISE STAMPS</p><h1>잘했어요!</h1><p>잘한 일 하나에 도장 하나. 나의 칭찬을 차곡차곡 모아요.</p></div>
      <div className="workspace">
        <aside>
          <section className="check-card">
            <div className="card-top"><span>칭찬 도장</span><span className="tag">잘할 때마다</span></div>
            <p className="today-date">{formatDate(today)}</p>
            <div className="big-stamp praise-stamp"><Star size={38} strokeWidth={1.4} /><strong>잘했어요!</strong><span>참 잘했어요</span></div>
            <h2>오늘의 잘한 일을 칭찬해요.</h2><p className="card-desc">작은 노력도 도장으로 남겨 보세요.</p>
            <button className="primary" disabled={loading || saving || deleting || !!error} onClick={addStamp}><Stamp size={19} />{saving ? '도장 찍는 중…' : loading ? '도장 확인 중…' : '잘했어요! 도장 찍기'}</button>
            <p className="timezone">하루에 여러 개 찍을 수 있어요.</p>
          </section>
          <section className="stats" aria-label="칭찬 도장 개수">
            <div><span><Stamp size={17} />모은 도장</span><strong>{loading ? '—' : records.length}<small>개</small></strong></div>
            <div><span><Star size={17} />오늘의 칭찬</span><strong>{loading ? '—' : dayCounts.get(today) ?? 0}<small>개</small></strong></div>
          </section>
          <div className="note"><CalendarDays size={20} /><p>로그인 없이 쓰는 칭찬 수첩.<br /><span>이 브라우저의 쿠키로 내 수첩을 찾아요.<br />쿠키 삭제·기기 변경 시 새로 시작해요.</span></p></div>
        </aside>
        <section className="record-card">
          <div className="record-heading">
            <div><p className="eyebrow">STAMP COLLECTION</p><h2>나의 칭찬 도장</h2></div>
            <div className="view-switch" aria-label="도장 보기 방식">
              <button aria-pressed={view === 'calendar'} className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><Grid2X2 size={16} />달력</button>
              <button aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => { setSelectedDay(''); setView('list'); }}><List size={16} />전체 도장</button>
            </div>
          </div>
          {error && <div className="error" role="alert">{error}<button onClick={() => void load()}><RefreshCw size={15} />다시 불러오기</button></div>}
          <div aria-live="polite">{message && <p className="success">{message}</p>}</div>
          {loading ? <div className="empty">도장을 불러오고 있어요…</div> : view === 'calendar' ? <>
            <div className="month-nav">
              <h3>{year}년 {mon}월 <span>도장 {monthRecords.length}개</span></h3>
              <div><button onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft size={20} /></button><button className="this-month" onClick={() => setMonth(today.slice(0,7))}>이번 달</button><button onClick={() => moveMonth(1)} disabled={month >= today.slice(0,7)} aria-label="다음 달"><ChevronRight size={20} /></button></div>
            </div>
            <div className="calendar"><div className="weekdays">{['일','월','화','수','목','금','토'].map(day => <span key={day}>{day}</span>)}</div>
              <div className="dates">
                {Array.from({ length: first }, (_, i) => <div key={`pad${i}`} className="day blank" />)}
                {Array.from({ length: count }, (_, i) => {
                  const day = `${month}-${String(i + 1).padStart(2,'0')}`;
                  const amount = dayCounts.get(day) ?? 0, isToday = day === today;
                  const content = <><span className="day-number">{i + 1}</span>{amount ? <span className="mini-stamp"><Star size={16} /><b>{amount}개</b></span> : isToday ? <span className="today-label">오늘</span> : <span className="day-dot" />}</>;
                  const className = `day ${isToday ? 'today ' : ''}${amount ? 'done ' : ''}${day > today ? 'future' : ''}`;
                  return amount ? <button key={day} className={className} onClick={() => showDay(day)} aria-label={`${day} 칭찬 도장 ${amount}개 보기`}>{content}</button> : <div key={day} className={className}>{content}</div>;
                })}
              </div>
            </div>
            <div className="calendar-footer"><span><i />칭찬 도장이 있는 날</span><span>날짜를 누르면 도장을 볼 수 있어요.</span></div>
          </> : <div className="history">
            {selectedDay && <div className="day-filter"><span>{formatDate(selectedDay)}</span><button onClick={() => setSelectedDay('')}>전체 도장 보기</button></div>}
            {visibleRecords.length === 0 ? <div className="empty"><Stamp size={36} /><h3>아직 찍힌 도장이 없어요.</h3><p>잘한 일을 칭찬하고 첫 도장을 찍어 보세요.</p></div> : <>
              <p className="history-total">{selectedDay ? '이날 모은' : '지금까지 모은'} 칭찬 도장 <b>{visibleRecords.length}개</b></p>
              <ul>{visibleRecords.map(record => <li key={record.id}>
                <span className="history-icon"><Star size={20} /></span>
                <div className="stamp-details"><strong>잘했어요!</strong><time>{record.day.replaceAll('-', '. ')} · {new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }).format(new Date(record.created_at))}</time></div>
                <button className="remove-stamp" disabled={saving || deleting} onClick={() => openDelete(record)} aria-label={`${formatDate(record.day)} 도장 없애기`}><Trash2 size={16} />없애기</button>
              </li>)}</ul>
            </>}
          </div>}
        </section>
      </div>
    </main>
    <footer><span className="footer-logo">도장 <small>dozang</small></span><span>잘한 일을 오래 기억해요.</span><span>Asia/Seoul · KST</span></footer>
    <dialog ref={dialog} className="delete-dialog" aria-labelledby="delete-title" onCancel={event => { if (deleting) event.preventDefault(); else { setDeleteTarget(null); setPassword(''); setDeleteError(''); } }}>
      <form onSubmit={removeStamp}>
        <div className="dialog-heading"><h2 id="delete-title">도장 없애기</h2><button type="button" onClick={closeDelete} disabled={deleting} aria-label="닫기"><X size={20} /></button></div>
        <p>{deleteTarget ? `${formatDate(deleteTarget.day)}의 “잘했어요!” 도장 하나를 없앱니다.` : '선택한 도장 하나를 없앱니다.'}</p>
        <label htmlFor="delete-password">오늘의 비밀번호</label>
        <input ref={passwordInput} id="delete-password" type="password" inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} required disabled={deleting} aria-describedby="password-help" />
        <p id="password-help" className="password-help">한국 시간 기준 오늘 날짜로 계산한 비밀번호를 입력해 주세요.</p>
        {deleteError && <p className="delete-error" role="alert">{deleteError}</p>}
        <div className="dialog-actions"><button className="cancel-delete" type="button" disabled={deleting} onClick={closeDelete}>취소</button><button className="confirm-delete" type="submit" disabled={deleting || !password}>{deleting ? '없애는 중…' : '도장 없애기'}</button></div>
      </form>
    </dialog>
  </>;
}

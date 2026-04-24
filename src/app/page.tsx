'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Search, BookOpen, Clock, MapPin, Hash, User, ExternalLink, FileText, Package, Palette, Upload, Download, Pencil, ChevronDown, Calendar, Clipboard } from 'lucide-react';

// ── 型定義 ────────────────────────────────────────
type Course = {
  id: string;
  name: string;
  professor: string;
  campus: string;
  term: string;
  day: string;
  period: string;
  faculty?: string;
};

type Timetable = { [key: string]: Course };
type NoteMap   = { [courseId: string]: { memo: string; materials: string; classroom: string } };

type SyncData = {
  allTerms?: any;
  currentTerm?: string;
  themeIdx?: number;
  selectedFaculty?: string;
  timetable?: Timetable;
  notes?: NoteMap;
};

// ── 定数 ──────────────────────────────────────────
const DAYS    = ['月', '火', '水', '木', '金'];
const PERIODS = ['1', '2', '3', '4', '5', '6'];

const PERIOD_TIMES: Record<string, string> = {
  '1': '9:00〜10:35',  '2': '10:45〜12:20', '3': '13:10〜14:45',
  '4': '14:55〜16:30', '5': '16:40〜18:15', '6': '18:25〜20:00',
};

const TERMS = ['2026春', '2026秋', '2027春', '2027秋', '2028春', '2028秋', '2029春', '2029秋'];

// ── ヘルパー ──────────────────────────────────────
function getSemester(termStr: string): '春' | '秋' | 'その他' {
  if (termStr.includes('春')) return '春';
  if (termStr.includes('秋')) return '秋';
  return 'その他';
}

type Theme = { label: string; bg: string; accent: string; colors: Record<string, string> };
const THEMES: Theme[] = [
  { label: 'ディープパープル', bg: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', accent: '#6366f1', colors: { '月': '#6366f1', '火': '#8b5cf6', '水': '#06b6d4', '木': '#10b981', '金': '#f59e0b' } },
  { label: 'ダークモード',     bg: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)', accent: '#58a6ff', colors: { '月': '#58a6ff', '火': '#a78bfa', '水': '#34d399', '木': '#fbbf24', '金': '#f87171' } },
];

function extractCode(name: string): string { const m = name.match(/^(\d+):/); return m ? m[1] : ''; }
function cleanName(name: string): string   { return name.replace(/^\d+:[A-Z0-9a-zÀ-ÿ\-]+ /, '').replace(/^\d+:/, '').trim(); }
function syllabusUrl(id: string): string   { return `https://syllabus.ritsumei.ac.jp/syllabus/s/r-syllabus/${id}`; }

const clamp3: React.CSSProperties = {
  display: '-webkit-box', overflow: 'hidden',
  // @ts-ignore
  WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SYNC_ENABLED = !!(SUPABASE_URL && !SUPABASE_URL.includes('placeholder') && SUPABASE_KEY && !SUPABASE_KEY.includes('placeholder'));

// ── Supabase REST util (no SDK needed) ────────────
async function supabaseUpsert(syncId: string, data: object): Promise<{success: boolean, error?: string}> {
  if (!SYNC_ENABLED) return { success: false, error: '環境変数が設定されていません' };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/timetable_sync`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
        'x-sync-id': syncId
      },
      body: JSON.stringify({ sync_id: syncId, data, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || res.statusText };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

async function supabaseFetch(syncId: string): Promise<{data: any, error?: string}> {
  if (!SYNC_ENABLED) return { data: null, error: '環境変数が設定されていません' };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/timetable_sync?sync_id=eq.${encodeURIComponent(syncId)}&select=data`, {
      headers: { 
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'x-sync-id': syncId
      },
    });
    if (!res.ok) {
      const err = await res.json();
      return { data: null, error: err.message || res.statusText };
    }
    const rows = await res.json();
    return { data: rows?.[0]?.data ?? null };
  } catch (e) {
    return { data: null, error: String(e) };
  }
}

// ────────────────────────────────────────────────
export default function Home() {
  const [timetable, setTimetable]       = useState<Timetable>({});
  const [allCourses, setAllCourses]     = useState<Course[]>([]);
  const [loadingData, setLoadingData]   = useState(true);
  const [notes, setNotes]               = useState<NoteMap>({});
  const [allTerms, setAllTerms]         = useState<Record<string, { timetable: Timetable; notes: NoteMap }>>({});
  const [currentTerm, setCurrentTerm]   = useState('2026春');
  const [selectedFaculty, setSelectedFaculty] = useState('情報理工学部');
  const [themeIdx, setThemeIdx]         = useState(0);
  const [showTheme, setShowTheme]       = useState(false);
  const [toast, setToast]               = useState('');
  const [showSync, setShowSync]         = useState(false);
  const [syncId, setSyncId]             = useState('');
  const [inputSyncId, setInputSyncId]   = useState('');
  const [showConfirm, setShowConfirm]   = useState(false); // カスタム確認モーダル用

  const fileRef  = useRef<HTMLInputElement>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme    = THEMES[themeIdx];

  const [addModal, setAddModal]           = useState<{ day: string; period: string } | null>(null);
  const [query, setQuery]                 = useState('');
  const [detailCourse, setDetailCourse]   = useState<Course | null>(null);
  const [editClassroom, setEditClassroom] = useState(false);
  const [showYearSelect, setShowYearSelect] = useState(false);
  const [showFacultySelect, setShowFacultySelect] = useState(false);

  // ── 初期ロード ────────────────────────────────
  useEffect(() => {
    const tt = localStorage.getItem('ritsumei-timetable');
    const nt = localStorage.getItem('ritsumei-notes');
    const th = localStorage.getItem('ritsumei-theme');
    const si = localStorage.getItem('ritsumei-sync-id');
    const at = localStorage.getItem('ritsumei-all-terms');
    const ct = localStorage.getItem('ritsumei-current-term');
    const sf = localStorage.getItem('ritsumei-selected-faculty');
    if (sf) setSelectedFaculty(sf);

    let sid = si;
    if (!sid) { sid = crypto.randomUUID(); localStorage.setItem('ritsumei-sync-id', sid); }
    setSyncId(sid);

    if (at) {
      const parsedAt = JSON.parse(at);
      setAllTerms(parsedAt);
      const activeTerm = ct || '2026春';
      setCurrentTerm(activeTerm);
      if (parsedAt[activeTerm]) {
        setTimetable(parsedAt[activeTerm].timetable || {});
        setNotes(parsedAt[activeTerm].notes || {});
      }
    } else if (tt) {
      // 移行処理: 古い形式のデータを2026春に移す
      const initialAll = { '2026春': { timetable: JSON.parse(tt || '{}'), notes: JSON.parse(nt || '{}') } };
      setAllTerms(initialAll);
      setCurrentTerm('2026春');
      setTimetable(initialAll['2026春'].timetable);
      setNotes(initialAll['2026春'].notes);
      localStorage.setItem('ritsumei-all-terms', JSON.stringify(initialAll));
      localStorage.setItem('ritsumei-current-term', '2026春');
    }

    if (th) setThemeIdx(Number(th));

    // Supabase から最新データを取得
    if (SYNC_ENABLED && sid) {
      supabaseFetch(sid).then(({data, error}) => {
        if (error || !data) return;
        const r = data as SyncData;
        
        // 新形式 (allTerms) または 旧形式 (timetable) から読み込み
        if (r.allTerms) {
          setAllTerms(r.allTerms);
          localStorage.setItem('ritsumei-all-terms', JSON.stringify(r.allTerms));
          const term = r.currentTerm || '2026春';
          setCurrentTerm(term);
          localStorage.setItem('ritsumei-current-term', term);
          if (r.allTerms[term]) {
            setTimetable(r.allTerms[term].timetable || {});
            setNotes(r.allTerms[term].notes || {});
          }
        } else if (r.timetable) {
          // 旧形式からの移行（クラウド側が古い場合）
          const migrated = { '2026春': { timetable: r.timetable, notes: r.notes || {} } };
          setAllTerms(migrated);
          setTimetable(r.timetable);
          setNotes(r.notes || {});
        }
        
        if (typeof r.themeIdx === 'number') { setThemeIdx(r.themeIdx); localStorage.setItem('ritsumei-theme', String(r.themeIdx)); }
        if (r.selectedFaculty) { setSelectedFaculty(r.selectedFaculty); localStorage.setItem('ritsumei-selected-faculty', r.selectedFaculty); }
      }).catch(() => {});
    }

    fetch('/syllabus.json?v=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then((d: Course[]) => { setAllCourses(d); setLoadingData(false); })
      .catch(() => setLoadingData(false));
  }, []);

  // ── クラウド保存 ──────────────────────────────
  const pushToCloud = useCallback((tt: Timetable, nt: NoteMap, ti: number, sid: string, alt?: any, ct?: string) => {
    if (!SYNC_ENABLED || !sid) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      // currentTerm と allTerms を含めて保存
      const payload = {
        allTerms: alt || JSON.parse(localStorage.getItem('ritsumei-all-terms') || '{}'),
        currentTerm: ct || localStorage.getItem('ritsumei-current-term') || '2026春',
        themeIdx: ti,
        selectedFaculty: localStorage.getItem('ritsumei-selected-faculty') || '情報理工学部'
      };
      // 最新の現在の学期のデータも反映しておく
      payload.allTerms[payload.currentTerm] = { timetable: tt, notes: nt };
      
      const { success, error } = await supabaseUpsert(sid, payload);
      if (!success) console.error('Auto sync failed:', error);
    }, 1500);
  }, []);

  // ── 学期切り替え ───────────────────────────────
  const switchTerm = (nextTerm: string) => {
    if (nextTerm === currentTerm) return;
    // 現在のデータを保存
    const updatedAll = { ...allTerms, [currentTerm]: { timetable, notes } };
    setAllTerms(updatedAll);
    localStorage.setItem('ritsumei-all-terms', JSON.stringify(updatedAll));

    // 新しい学期を読み込み
    const target = updatedAll[nextTerm] || { timetable: {}, notes: {} };
    setCurrentTerm(nextTerm);
    localStorage.setItem('ritsumei-current-term', nextTerm);
    setTimetable(target.timetable || {});
    setNotes(target.notes || {});
    
    pushToCloud(target.timetable || {}, target.notes || {}, themeIdx, syncId, updatedAll, nextTerm);
    showToast(`📅 ${nextTerm} に切り替えました`);
  };

  const switchFaculty = (f: string) => {
    setSelectedFaculty(f);
    localStorage.setItem('ritsumei-selected-faculty', f);
    pushToCloud(timetable, notes, themeIdx, syncId, allTerms, currentTerm);
    showToast(`🎓 ${f} に切り替えました`);
  };

  const switchYear = (nextYear: string) => {
    const sem = getSemester(currentTerm);
    switchTerm(nextYear + sem);
  };

  // ── トースト ─────────────────────────────────
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // ── 同期ID連携 ────────────────────────────────
  const initSyncIdLink = () => {
    if (!inputSyncId || inputSyncId.length < 10) return showToast('有効な同期IDを入力してください');
    setShowSync(false); // 設定メニューを閉じてモーダルを見やすくする
    setShowConfirm(true); // カスタムモーダルを表示
  };



  const handleSyncIdLink = async () => {
    setShowConfirm(false);
    setLoadingData(true);
    console.log('🔄 同期開始: ID =', inputSyncId);

    try {
      const { data, error } = await supabaseFetch(inputSyncId);
      if (error) {
        showToast(`❌ 同期失敗: ${error}`);
        return;
      }
      if (data) {
        const r = data as SyncData;
        
        if (r.allTerms) {
          setAllTerms(r.allTerms);
          localStorage.setItem('ritsumei-all-terms', JSON.stringify(r.allTerms));
          const term = r.currentTerm || '2026春';
          setCurrentTerm(term);
          localStorage.setItem('ritsumei-current-term', term);
          if (r.allTerms[term]) {
            setTimetable(r.allTerms[term].timetable || {});
            setNotes(r.allTerms[term].notes || {});
          }
          if (r.selectedFaculty) {
            setSelectedFaculty(r.selectedFaculty);
            localStorage.setItem('ritsumei-selected-faculty', r.selectedFaculty);
          }
        } else if (r.timetable) {
          const migrated = { '2026春': { timetable: r.timetable, notes: r.notes || {} } };
          setAllTerms(migrated);
          setTimetable(r.timetable);
          setNotes(r.notes || {});
        }
        
        if (typeof r.themeIdx === 'number') setThemeIdx(r.themeIdx);
        showToast('同期が完了しました');
      } else {
        showToast('指定されたIDのデータが見つかりませんでした');
      }
      setSyncId(inputSyncId);
      localStorage.setItem('ritsumei-sync-id', inputSyncId);
      setShowSync(false);
    } catch (e) {
      showToast('同期エラーが発生しました');
    } finally {
      setLoadingData(false);
    }
  };

  // ── 手動同期（今すぐアップロード/ダウンロード） ─
  const manualPush = async () => {
    showToast('☁ クラウドに保存中...');
    const updatedAll = { ...allTerms, [currentTerm]: { timetable, notes } };
    const { success, error } = await supabaseUpsert(syncId, { allTerms: updatedAll, currentTerm, themeIdx, selectedFaculty });
    if (success) showToast('✅ クラウド保存完了');
    else showToast(`❌ 保存失敗: ${error}`);
  };

  const manualPull = async () => {
    showToast('☁ クラウドから読み込み中...');
    const { data, error } = await supabaseFetch(syncId);
    if (error) return showToast(`❌ 読み込み失敗: ${error}`);
    if (!data) return showToast('クラウドにデータがありません');
    
    const r = data as SyncData;
    if (r.allTerms) {
      setAllTerms(r.allTerms);
      const term = r.currentTerm || currentTerm;
      setCurrentTerm(term);
      if (r.allTerms[term]) {
        setTimetable(r.allTerms[term].timetable || {});
        setNotes(r.allTerms[term].notes || {});
      }
    } else if (r.timetable) {
      setTimetable(r.timetable);
      setNotes(r.notes || {});
    }
    if (typeof r.themeIdx === 'number') setThemeIdx(r.themeIdx);
    if (r.selectedFaculty) setSelectedFaculty(r.selectedFaculty);
    showToast('✅ 最新データを取得しました');
  };

  // ── テーマ変更 ────────────────────────────────
  const changeTheme = (i: number) => {
    setThemeIdx(i); localStorage.setItem('ritsumei-theme', String(i));
    setShowTheme(false); pushToCloud(timetable, notes, i, syncId);
  };

  // ── 検索結果 ─────────────────────────────────
  // day-only courses (period==="") also appear in any slot of that day
  const results = (() => {
    if (!addModal) return [];
    
    // 現在の学期からターゲットのセメスター（春 or 秋）を抽出
    const currentSem = getSemester(currentTerm);

    const base = allCourses.filter((c: Course) => {
      // 曜日と時限の基本フィルタ
      const matchSlot = (c.day === addModal.day && (c.period === addModal.period || c.period === ''));
      if (!matchSlot) return false;

      // 学部フィルタ
      const facultyMatch = (c.faculty || '情報理工学部') === selectedFaculty;
      if (!facultyMatch) return false;

      // セメスターの一致確認（「通年」や「集中」などは常に表示）
      if (currentSem === 'その他') return true;
      const courseSem = c.term || '';
      const isMatchSemester = courseSem.includes(currentSem) || courseSem.includes('通年') || courseSem.includes('集中');
      
      return isMatchSemester;
    });

    if (query.trim() === '') return base.slice(0, 50);
    const q = query.toLowerCase();
    return base.filter((c: Course) => c.name.toLowerCase().includes(q) || c.professor.toLowerCase().includes(q)).slice(0, 50);
  })();

  // ── 授業を追加 ───────────────────────────────
  const addCourse = (course: Course) => {
    let next = { ...timetable };
    const key = `${addModal?.day || course.day}-${addModal?.period || course.period}`;
    next[key] = { ...course, day: addModal?.day || course.day, period: addModal?.period || course.period };
    setTimetable(next); localStorage.setItem('ritsumei-timetable', JSON.stringify(next));
    
    // allTerms も更新
    const updatedAll = { ...allTerms, [currentTerm]: { timetable: next, notes } };
    setAllTerms(updatedAll);
    localStorage.setItem('ritsumei-all-terms', JSON.stringify(updatedAll));

    pushToCloud(next, notes, themeIdx, syncId, updatedAll, currentTerm);
    setAddModal(null); setQuery('');
  };

  // ── 授業を削除 ───────────────────────────────
  const removeCourse = (day: string, period: string) => {
    const key = `${day}-${period}`;
    const next = { ...timetable };
    delete next[key];
    setTimetable(next); localStorage.setItem('ritsumei-timetable', JSON.stringify(next));
    
    // allTerms も更新
    const updatedAll = { ...allTerms, [currentTerm]: { timetable: next, notes } };
    setAllTerms(updatedAll);
    localStorage.setItem('ritsumei-all-terms', JSON.stringify(updatedAll));

    pushToCloud(next, notes, themeIdx, syncId, updatedAll, currentTerm);
    setDetailCourse(null);
  };

  // ── メモ・教材・教室を保存 ───────────────────
  const saveNote = (courseId: string, field: 'memo' | 'materials' | 'classroom', value: string) => {
    const next = { ...notes, [courseId]: { ...notes[courseId], [field]: value } };
    setNotes(next); localStorage.setItem('ritsumei-notes', JSON.stringify(next));
    
    // allTerms も更新
    const updatedAll = { ...allTerms, [currentTerm]: { timetable, notes: next } };
    setAllTerms(updatedAll);
    localStorage.setItem('ritsumei-all-terms', JSON.stringify(updatedAll));

    pushToCloud(timetable, next, themeIdx, syncId, updatedAll, currentTerm);
  };

  // ── エクスポート / インポート ─────────────────
  const exportData = () => {
    const obj = { allTerms, currentTerm, selectedFaculty, timetable, notes, themeIdx, syncId, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `ritsumei-${new Date().toLocaleDateString('ja-JP').replace(/\//g,'')}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast('📥 エクスポート完了'); setShowSync(false);
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target?.result as string);
        if (obj.timetable) { setTimetable(obj.timetable); localStorage.setItem('ritsumei-timetable', JSON.stringify(obj.timetable)); }
        if (obj.notes)     { setNotes(obj.notes);          localStorage.setItem('ritsumei-notes', JSON.stringify(obj.notes)); }
        if (typeof obj.themeIdx === 'number') { setThemeIdx(obj.themeIdx); localStorage.setItem('ritsumei-theme', String(obj.themeIdx)); }
        if (obj.selectedFaculty) { setSelectedFaculty(obj.selectedFaculty); localStorage.setItem('ritsumei-selected-faculty', obj.selectedFaculty); }
        if (obj.syncId) { setSyncId(obj.syncId); localStorage.setItem('ritsumei-sync-id', obj.syncId); }
        showToast('✅ インポート・同期完了');
      } catch { showToast('❌ 読み込み失敗'); }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
    setShowSync(false);
  };
  
  // ── 授業コードを一括コピー ───────────────────
  const copyAllCodes = () => {
    const codes = Object.values(timetable)
      .map(c => extractCode(c.name))
      .filter(code => code !== '')
      .join('\n');
    
    if (!codes) {
      showToast('登録されている授業がありません');
      return;
    }
    
    navigator.clipboard.writeText(codes).then(() => {
      showToast('📋 授業コードをコピーしました');
    }).catch(() => {
      showToast('❌ コピーに失敗しました');
    });
    setShowSync(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, fontFamily: "'Inter','Hiragino Sans',sans-serif", color: '#fff', position: 'relative' }}>

      {/* ── ヘッダー ── */}
      <header style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={18} color={theme.accent} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Ritsumei Time</span>
          <span style={{ fontSize: 11, color: loadingData ? '#a5b4fc' : '#6ee7b7', background: loadingData ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: 20 }}>
            {loadingData ? '読み込み中...' : `${allCourses.length}件`}
          </span>
          {SYNC_ENABLED && <span style={{ fontSize: 10, color: '#6ee7b7', background: 'rgba(16,185,129,0.12)', padding: '2px 7px', borderRadius: 20 }}>☁ 自動同期ON</span>}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {/* テーマ */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setShowTheme(v => !v); setShowSync(false); }}
                style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${theme.accent}50`, borderRadius: 20, padding: '5px 11px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <Palette size={12} color={theme.accent} />テーマ
              </button>
              {showTheme && (
                <div style={{ position: 'absolute', right: 0, top: 36, background: '#1a1740', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: 10, zIndex: 50, width: 195, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  {THEMES.map((t, i) => (
                    <button key={i} onClick={() => changeTheme(i)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: i === themeIdx ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 13, textAlign: 'left' }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: t.accent, flexShrink: 0, display: 'block' }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 同期 */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setShowSync(v => !v); setShowTheme(false); }}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '5px 11px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <Upload size={12} />同期
              </button>
              {showSync && (
                <div style={{ position: 'absolute', right: 0, top: 36, background: '#1a1740', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: 14, zIndex: 50, width: 232, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  {SYNC_ENABLED ? (
                    <>
                      <p style={{ fontSize: 11, color: '#6ee7b7', marginBottom: 8, lineHeight: 1.6 }}>☁ クラウド自動同期中<br/>同じ同期IDをスマホに共有すれば自動同期できます。</p>
                      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', wordBreak: 'break-all', marginBottom: 8 }}>{syncId}</div>
                      <button onClick={() => { navigator.clipboard.writeText(syncId); showToast('同期IDをコピーしました'); }}
                        style={{ width: '100%', padding: '8px', background: `${theme.accent}15`, border: `1px solid ${theme.accent}40`, borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 12, marginBottom: 8 }}>
                        同期IDをコピー
                      </button>

                      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                        <button onClick={manualPush} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Upload size={10} /> 今すぐ保存
                        </button>
                        <button onClick={manualPull} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Download size={10} /> 最新を読込
                        </button>
                      </div>

                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10, marginTop: 4 }}>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>他のデバイスのIDを入力して連携</p>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input 
                            type="text" 
                            placeholder="同期IDを入力..."
                            value={inputSyncId}
                            onChange={(e) => setInputSyncId(e.target.value)}
                            onKeyDown={(e) => { if(e.key === 'Enter') initSyncIdLink(); }}
                            style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#fff', outline: 'none' }}
                          />
                          <button 
                            onClick={initSyncIdLink}
                            style={{ padding: '5px 10px', background: theme.accent, border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', fontSize: 11, fontWeight: 'bold' }}
                          >
                            連携
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8, lineHeight: 1.6 }}>📱 JSONファイルをLINEなどで共有して同期できます。</p>
                  )}
                  <button onClick={exportData}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 12, marginBottom: 5 }}>
                    <Download size={12} />データをエクスポート
                  </button>
                  <button onClick={() => fileRef.current?.click()}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 12, marginBottom: 5 }}>
                    <Upload size={12} />ファイルをインポート
                  </button>
                  <button onClick={copyAllCodes}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', background: `${theme.accent}15`, border: `1px solid ${theme.accent}30`, borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 12 }}>
                    <Clipboard size={12} color={theme.accent} />授業コードを一括コピー
                  </button>
                  <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importData} />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
 
      {/* ── 学期選択・年度選択タブ ── */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '10px 14px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        
        {/* 年度選択ドロップダウン */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setShowYearSelect(!showYearSelect); setShowTheme(false); setShowSync(false); }}
            style={{
              padding: '7px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)', color: theme.accent, border: `1px solid ${theme.accent}40`,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
            }}>
            <Calendar size={14} />
            {currentTerm.substring(0, 4)}年度
            <ChevronDown size={14} style={{ transform: showYearSelect ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>

          {showYearSelect && (
            <>
              <div onClick={() => setShowYearSelect(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', top: '120%', left: 0, background: '#1a1740', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 14, padding: 8, zIndex: 50, width: 140, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', gap: 4
              }}>
                {['2026', '2027', '2028', '2029'].map(y => {
                  const isActive = currentTerm.startsWith(y);
                  return (
                    <button key={y} onClick={() => { switchYear(y); setShowYearSelect(false); }}
                      style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: isActive ? `${theme.accent}30` : 'transparent',
                        color: isActive ? theme.accent : 'rgba(255,255,255,0.7)',
                        border: 'none', textAlign: 'left', transition: 'all 0.2s'
                      }}>
                      {y}年度
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* セメスター切り替え（既存のスタイルを維持） */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '3px', border: '1px solid rgba(255,255,255,0.08)' }}>
          {['春', '秋'].map(sem => {
            const y = currentTerm.substring(0, 4);
            const t = y + sem;
            const isActive = t === currentTerm;
            return (
              <button key={sem} onClick={() => switchTerm(t)}
                style={{
                  padding: '6px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: isActive ? theme.accent : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  border: 'none', transition: 'all 0.2s'
                }}>
                {sem}
              </button>
            );
          })}
        </div>

        {/* 学部選択ドロップダウン */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button onClick={() => { setShowFacultySelect(!showFacultySelect); setShowYearSelect(false); setShowTheme(false); setShowSync(false); }}
            style={{
              padding: '7px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)', color: theme.accent, border: `1px solid ${theme.accent}40`,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
            }}>
            <BookOpen size={14} />
            {selectedFaculty === '情報理工学部' ? '情理' : selectedFaculty === '理工学部' ? '理工' : selectedFaculty}
            <ChevronDown size={14} style={{ transform: showFacultySelect ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>

          {showFacultySelect && (
            <>
              <div onClick={() => setShowFacultySelect(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', top: '120%', right: 0, background: '#1a1740', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 14, padding: 8, zIndex: 50, width: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', gap: 4
              }}>
                {['理工学部', '情報理工学部'].map(fac => {
                  const isActive = fac === selectedFaculty;
                  return (
                    <button key={fac} onClick={() => { switchFaculty(fac); setShowFacultySelect(false); }}
                      style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: isActive ? `${theme.accent}30` : 'transparent',
                        color: isActive ? theme.accent : 'rgba(255,255,255,0.7)',
                        border: 'none', textAlign: 'left', transition: 'all 0.2s'
                      }}>
                      {fac}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 時間割グリッド ── */}
      <main style={{ maxWidth: 920, margin: '0 auto', padding: '14px 6px 80px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 46 }} />
              {DAYS.map(d => <col key={d} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={{ padding: '4px 2px', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}></th>
                {DAYS.map(d => <th key={d} style={{ padding: '6px 3px', fontSize: 13, fontWeight: 700, color: theme.colors[d], textAlign: 'center' }}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map(p => (
                <tr key={p}>
                  <td style={{ textAlign: 'center', padding: '3px 2px', verticalAlign: 'middle' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd' }}>{p}</div>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1.3 }}>{PERIOD_TIMES[p].split('〜')[0]}</div>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1.3 }}>{PERIOD_TIMES[p].split('〜')[1]}</div>
                  </td>
                  {DAYS.map(d => {
                    const key    = `${d}-${p}`;
                    const course = timetable[key];
                    const color  = theme.colors[d];
                    return (
                      <td key={d} style={{ padding: '3px', verticalAlign: 'top', height: 90 }}>
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>

                          {/* 通常授業 or 追加ボタン */}
                          {course ? (
                            <div onClick={() => setDetailCourse(course)}
                              style={{ background: `linear-gradient(135deg, ${color}35, ${color}18)`, border: `1.5px solid ${color}55`, borderRadius: 8, padding: '5px 7px', flex: '1 1 auto', cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, transition: 'opacity 0.15s' }}
                              onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.opacity = '0.8')}
                              onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.opacity = '1')}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: '#e2e8f0', ...clamp3 }}>
                                {cleanName(course.name)}
                              </div>
                              {/* 教室表示: カスタム教室 → campus の順 */}
                              {(() => { const cl = notes[course.id]?.classroom || course.campus; return cl ? (
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                                  <MapPin size={8} /><span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{cl}</span>
                                </div>
                              ) : null; })()}
                            </div>
                          ) : (
                            <button onClick={() => { setAddModal({ day: d, period: p }); setQuery(''); }}
                              style={{ width: '100%', flex: '1 1 auto', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', transition: 'all 0.2s' }}
                              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = `${color}15`; e.currentTarget.style.borderColor = `${color}50`; e.currentTarget.style.color = color; }}
                              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.15)'; }}
                            >
                              <Plus size={15} />
                            </button>
                          )}

                          {/* 曜日のみの授業も上記 course として描画されるため allDay 処理は削除 */}


                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* 背景クローズ */}
      {(showTheme || showSync) && <div onClick={() => { setShowTheme(false); setShowSync(false); }} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />}

      {/* トースト */}
      {toast && (
        <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', background: 'rgba(30,27,74,0.97)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 14, padding: '12px 20px', fontSize: 13, fontWeight: 600, zIndex: 99999, whiteSpace: 'nowrap', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', color: '#fff', backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}

      {/* ── 授業詳細パネル ── */}
      {detailCourse && (() => {
        const c        = detailCourse;
        const color    = theme.colors[c.day] ?? theme.accent;
        const code     = extractCode(c.name);
        const noteData = notes[c.id] ?? { memo: '', materials: '', classroom: '' };
        const displayClassroom = noteData.classroom || c.campus;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }} onClick={() => { setDetailCourse(null); setEditClassroom(false); }}>
            <div style={{ background: '#1a1740', borderRadius: 20, padding: 20, width: '100%', maxWidth: 480, border: `1px solid ${color}40`, maxHeight: '88vh', overflowY: 'auto' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>

              {/* タイトル */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ flex: 1, paddingRight: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: '#e2e8f0' }}>{cleanName(c.name)}</div>
                  <div style={{ fontSize: 11, color: color, marginTop: 3, fontWeight: 600 }}>
                    {c.day}曜{c.period}限　{PERIOD_TIMES[c.period] ?? ''}
                  </div>
                </div>
                <button onClick={() => { setDetailCourse(null); setEditClassroom(false); }}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              {/* 基本情報 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18 }}>
                {code && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Hash size={13} color="rgba(255,255,255,0.4)" />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', width: 68, flexShrink: 0 }}>授業コード</span>
                    <span style={{ fontSize: 13, color: '#e2e8f0', fontFamily: 'monospace' }}>{code}</span>
                  </div>
                )}

                {c.professor && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <User size={13} color="rgba(255,255,255,0.4)" />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', width: 68, flexShrink: 0 }}>担当教員</span>
                    <span style={{ fontSize: 13, color: '#e2e8f0' }}>{c.professor}</span>
                  </div>
                )}

                {/* 授業施設（編集可能） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MapPin size={13} color="rgba(255,255,255,0.4)" />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', width: 68, flexShrink: 0 }}>授業施設</span>
                  {editClassroom ? (
                    <input autoFocus value={noteData.classroom}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => saveNote(c.id, 'classroom', e.target.value)}
                      onBlur={() => setEditClassroom(false)}
                      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') setEditClassroom(false); }}
                      placeholder="例: アドセミナリオ202号教室"
                      style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: `1px solid ${color}60`, borderRadius: 7, padding: '4px 8px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, cursor: 'pointer' }} onClick={() => setEditClassroom(true)}>
                      <span style={{ fontSize: 13, color: displayClassroom ? '#e2e8f0' : 'rgba(255,255,255,0.25)' }}>
                        {displayClassroom || 'タップして教室を入力'}
                      </span>
                      <Pencil size={11} color={color} />
                    </div>
                  )}
                </div>

                {c.term && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Clock size={13} color="rgba(255,255,255,0.4)" />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', width: 68, flexShrink: 0 }}>開講時期</span>
                    <span style={{ fontSize: 13, color: '#e2e8f0' }}>{c.term}</span>
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 16 }} />

              {/* メモ */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <FileText size={13} color={color} /><span style={{ fontSize: 12, fontWeight: 600, color: color }}>メモ</span>
                </div>
                <textarea value={noteData.memo} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => saveNote(c.id, 'memo', e.target.value)} placeholder="授業に関するメモを入力..." rows={3}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.6 }}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()} />
              </div>

              {/* 必要な教材 */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <Package size={13} color={color} /><span style={{ fontSize: 12, fontWeight: 600, color: color }}>必要な教材</span>
                </div>
                <textarea value={noteData.materials} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => saveNote(c.id, 'materials', e.target.value)} placeholder="教科書・参考書・持ち物など..." rows={2}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.6 }}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()} />
              </div>

              {/* ボタン */}
              <div style={{ display: 'flex', gap: 10 }}>
                <a href={syllabusUrl(c.id)} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 14px', background: `linear-gradient(135deg, ${color}, ${color}99)`, borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                  <ExternalLink size={13} />シラバスを開く
                </a>
                <button onClick={() => removeCourse(c.day, c.period)}
                  style={{ padding: '11px 14px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, color: '#f87171', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <X size={13} />削除
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 授業追加モーダル ── */}
      {addModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }} onClick={() => setAddModal(null)}>
          <div style={{ background: '#1a1740', borderRadius: 20, padding: 18, width: '100%', maxWidth: 500, maxHeight: '78vh', display: 'flex', flexDirection: 'column', gap: 12, border: `1px solid ${theme.colors[addModal.day]}40` }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{addModal.day}曜 {addModal.period}限に追加</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{PERIOD_TIMES[addModal.period]}</div>
              </div>
              <button onClick={() => setAddModal(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
              <input autoFocus type="text" placeholder="授業名・教員名で絞り込み（空欄で全件）" value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                style={{ width: '100%', padding: '9px 12px 9px 30px', background: 'rgba(255,255,255,0.07)', border: `1px solid ${theme.colors[addModal.day]}40`, borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginTop: -6 }}>{results.length}件{results.length >= 50 ? '（上限50）' : ''}</div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {loadingData && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 13 }}>読み込み中...</p>}
              {!loadingData && allCourses.length === 0 && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 13 }}>syllabus.json が見つかりません</p>}
              {results.length === 0 && !loadingData && allCourses.length > 0 && query.trim() !== '' && <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 13 }}>「{query}」に該当なし</p>}

              {query.trim() !== '' && (
                <button 
                  onClick={() => addCourse({ id: 'custom-' + Date.now(), name: query, professor: '', campus: '', term: '', day: addModal.day, period: addModal.period })}
                  style={{ background: `${theme.accent}15`, border: `1.5px solid ${theme.accent}40`, borderRadius: 10, padding: '12px', cursor: 'pointer', textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 10 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Plus size={14} color={theme.accent} />
                    「{query}」を新規作成して追加
                  </div>
                </button>
              )}
               {results.map((c: Course) => {
                const color = theme.colors[addModal.day];
                return (
                  <button key={c.id} onClick={() => addCourse(c)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', color: '#fff', transition: 'all 0.12s' }}
                    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = `${color}20`; e.currentTarget.style.borderColor = `${color}60`; }}
                    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 3, color: '#e2e8f0' }}>{cleanName(c.name)}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {c.period === '' && <span style={{ color, fontWeight: 600 }}>📅 全時限</span>}
                      {c.professor && <span>{c.professor}</span>}
                      {c.campus && <span>{c.campus}</span>}
                      {c.term && <span>{c.term}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 同期確認モーダル ── */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1a1740', border: `1.5px solid ${theme.accent}60`, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>データの連携確認</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 24, lineHeight: 1.6 }}>
              指定された同期IDのデータを読み込みます。<br/>
              <span style={{ color: '#f87171', fontWeight: 600 }}>このデバイスの現在の時間割データは上書きされます。</span>よろしいですか？
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>キャンセル</button>
              <button onClick={handleSyncIdLink} style={{ flex: 1, padding: '12px', background: theme.accent, border: 'none', borderRadius: 12, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>連携して上書き</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

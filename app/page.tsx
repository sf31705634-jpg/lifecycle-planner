"use client";
// @ts-nocheck

import React, { useState, useMemo, useEffect } from 'react';
import { Clock, CalendarDays, Calendar, Plus, Trash2, Copy, Edit2, FilePlus, X, Cloud, CloudOff, Loader2, LogOut, ChevronLeft, ChevronRight, Settings, ArrowLeft } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// --- Firebase 初期化 ---
// ⚠️古山さんへ：ここをご自身の本物のAPIキーに書き換えてください！⚠️
const firebaseConfig = {
  apiKey: "AIzaSyBuug-V_-0PLEaKDHMxIkn9u3DLO8kbgbU",
  authDomain: "lifecycleplanner-3cad1.firebaseapp.com",
  projectId: "lifecycleplanner-3cad1",
  storageBucket: "lifecycleplanner-3cad1.firebasestorage.app",
  messagingSenderId: "676304937950",
  appId: "1:676304937950:web:d25f252849cd0b97c9b34f"
};

const app = firebaseConfig.apiKey !== "AIzaSy..." ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = "lifecycle-planner-furuyama";

// --- Utils: 時間・日付計算用の補助関数 ---
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const getYYYYMMDD = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (date) => {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth() + 1}/${date.getDate()} (${days[date.getDay()]})`;
};

const isSameDay = (date1, date2) => {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
};

// 月間カレンダー生成用
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

const generateMonthGrid = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  
  const grid = [];
  let currentWeek = [];
  
  for (let i = 0; i < firstDay; i++) {
    currentWeek.push(null);
  }
  
  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(new Date(year, month, d));
    if (currentWeek.length === 7) {
      grid.push(currentWeek);
      currentWeek = [];
    }
  }
  
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    grid.push(currentWeek);
  }

  // レイアウトを安定させるために常に6行にする
  while (grid.length < 6) {
    grid.push(Array(7).fill(null));
  }
  
  return grid;
};

// --- カラーパレットの定義 ---
const THEME_COLORS = [
  { id: 'slate', value: 'bg-slate-100 border-slate-300 text-slate-800' },
  { id: 'red', value: 'bg-red-100 border-red-300 text-red-800' },
  { id: 'orange', value: 'bg-orange-100 border-orange-300 text-orange-800' },
  { id: 'amber', value: 'bg-amber-100 border-amber-300 text-amber-800' },
  { id: 'yellow', value: 'bg-yellow-100 border-yellow-300 text-yellow-800' },
  { id: 'lime', value: 'bg-lime-100 border-lime-300 text-lime-800' },
  { id: 'green', value: 'bg-green-100 border-green-300 text-green-800' },
  { id: 'emerald', value: 'bg-emerald-100 border-emerald-300 text-emerald-800' },
  { id: 'teal', value: 'bg-teal-100 border-teal-300 text-teal-800' },
  { id: 'cyan', value: 'bg-cyan-100 border-cyan-300 text-cyan-800' },
  { id: 'sky', value: 'bg-sky-100 border-sky-300 text-sky-800' },
  { id: 'blue', value: 'bg-blue-100 border-blue-300 text-blue-800' },
  { id: 'indigo', value: 'bg-indigo-100 border-indigo-300 text-indigo-800' },
  { id: 'violet', value: 'bg-violet-100 border-violet-300 text-violet-800' },
  { id: 'purple', value: 'bg-purple-100 border-purple-300 text-purple-800' },
  { id: 'fuchsia', value: 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800' },
  { id: 'pink', value: 'bg-pink-100 border-pink-300 text-pink-800' },
  { id: 'rose', value: 'bg-rose-100 border-rose-300 text-rose-800' },
];

// --- タイムライン生成エンジン ---
const generateTimeline = (events) => {
  if (!events) return [];
  const sortedEvents = [...events].sort((a, b) => {
    const startA = timeToMinutes(a.startTime);
    const startB = timeToMinutes(b.startTime);
    if (startA !== startB) return startA - startB;
    return timeToMinutes(b.endTime) - timeToMinutes(a.endTime);
  });

  const timelineBlocks = [];
  let currentTime = 0;
  let i = 0;

  while (i < sortedEvents.length) {
    const ev = sortedEvents[i];
    const evStart = timeToMinutes(ev.startTime);
    const evEnd = timeToMinutes(ev.endTime) === 0 && ev.endTime === '00:00' ? 1440 : timeToMinutes(ev.endTime);

    if (evStart > currentTime) {
      timelineBlocks.push({
        type: 'free', id: `free_${currentTime}_${evStart}`,
        startTime: minutesToTime(currentTime), endTime: minutesToTime(evStart), durationMinutes: evStart - currentTime,
      });
      currentTime = evStart;
    }

    const clusterEvents = [ev];
    let clusterEnd = evEnd;
    i++;
    while (i < sortedEvents.length) {
      const nextEv = sortedEvents[i];
      const nextStart = timeToMinutes(nextEv.startTime);
      if (nextStart < clusterEnd) {
        clusterEvents.push(nextEv);
        const nextEnd = timeToMinutes(nextEv.endTime) === 0 && nextEv.endTime === '00:00' ? 1440 : timeToMinutes(nextEv.endTime);
        clusterEnd = Math.max(clusterEnd, nextEnd);
        i++;
      } else {
        break;
      }
    }

    timelineBlocks.push({
      type: 'cluster', id: `cluster_${currentTime}_${clusterEnd}`,
      startTime: minutesToTime(currentTime), endTime: minutesToTime(clusterEnd),
      durationMinutes: clusterEnd - currentTime, events: clusterEvents
    });
    
    currentTime = clusterEnd;
  }

  if (currentTime < 1440) {
    timelineBlocks.push({
      type: 'free', id: `free_${currentTime}_1440`,
      startTime: minutesToTime(currentTime), endTime: '24:00', durationMinutes: 1440 - currentTime,
    });
  }
  return timelineBlocks;
};

// --- Mock Data: 初期データ ---
const INITIAL_BASELINES = [
  {
    id: 'b1',
    name: '基本の平日',
    events: [
      { id: 'e1', startTime: '00:00', endTime: '07:00', title: '睡眠', color: THEME_COLORS[0].value, isLocked: true },
      { id: 'e2', startTime: '07:00', endTime: '08:00', title: '朝の準備', color: THEME_COLORS[0].value, isLocked: true },
      { id: 'e4', startTime: '09:00', endTime: '18:00', title: '仕事', color: THEME_COLORS[11].value, isLocked: true },
      { id: 'e6', startTime: '19:00', endTime: '20:30', title: '夕食・お風呂', color: THEME_COLORS[0].value, isLocked: false },
      { id: 'e8', startTime: '23:30', endTime: '24:00', title: '睡眠準備', color: THEME_COLORS[0].value, isLocked: true },
    ]
  }
];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // --- 大規模改修: モードと状態 ---
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' | 'daily' | 'template'
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [baselines, setBaselines] = useState([]);
  const [activeBaselineId, setActiveBaselineId] = useState('');
  const [dailySchedules, setDailySchedules] = useState({}); // { '2026-05-11': [...] }

  // --- Firebase Auth & Firestore Sync ---
  useEffect(() => {
    if (!auth) {
      setBaselines(INITIAL_BASELINES);
      setActiveBaselineId(INITIAL_BASELINES[0].id);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (error) { alert("ログインに失敗しました。"); }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try { await signOut(auth); } catch (error) {}
  };

  useEffect(() => {
    if (!user || !db) return;

    // テンプレートの同期
    const baselinesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'baselines');
    const unsubBaselines = onSnapshot(baselinesRef, (snapshot) => {
      const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (loaded.length === 0) {
        INITIAL_BASELINES.forEach(async (b) => {
          await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'baselines', b.id), { name: b.name, events: b.events });
        });
      } else {
        setBaselines(loaded);
        setActiveBaselineId(prev => loaded.find(b => b.id === prev) ? prev : (loaded.length > 0 ? loaded[0].id : ''));
      }
      setLoading(false);
    });

    // 日々の予定の同期
    const dailyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'dailySchedules');
    const unsubDaily = onSnapshot(dailyRef, (snapshot) => {
      const newDaily = {};
      snapshot.docs.forEach(doc => {
        newDaily[doc.id] = doc.data().events || [];
      });
      setDailySchedules(newDaily);
    });

    return () => { unsubBaselines(); unsubDaily(); };
  }, [user]);

  // 現在時刻の管理
  const [nowDate, setNowDate] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

  // --- 表示用データ ---
  const dateStr = getYYYYMMDD(currentDate);
  const isTodayView = viewMode === 'daily' && isSameDay(currentDate, nowDate);
  
  const currentEvents = useMemo(() => {
    if (viewMode === 'template') {
      const b = baselines.find(b => b.id === activeBaselineId);
      return b ? b.events : [];
    } else {
      return dailySchedules[dateStr]; // 未設定の場合は undefined
    }
  }, [viewMode, activeBaselineId, baselines, dailySchedules, dateStr]);

  // --- モーダル用状態 ---
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  
  const [editEventId, setEditEventId] = useState(null);
  const [editEventTitle, setEditEventTitle] = useState('');
  const [editEventStartTime, setEditEventStartTime] = useState('00:00');
  const [editEventEndTime, setEditEventEndTime] = useState('00:00');
  const [editEventColor, setEditEventColor] = useState(THEME_COLORS[0].value);
  const [editEventIsLocked, setEditEventIsLocked] = useState(false);
  const [isNewEvent, setIsNewEvent] = useState(false);

  const [dragState, setDragState] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);

  // ドラッグプレビュー用
  const previewEvents = useMemo(() => {
    const baseEvents = currentEvents || [];
    if (!dragState || !dragPreview || dragState.isLocked) return baseEvents;

    return baseEvents.map(ev => {
      if (ev.id === dragState.id) {
        return { ...ev, startTime: minutesToTime(dragPreview.startMins), endTime: minutesToTime(dragPreview.endMins), isDragging: true };
      }
      return ev;
    });
  }, [currentEvents, dragState, dragPreview]);

  const timelineBlocks = useMemo(() => generateTimeline(previewEvents), [previewEvents]);

  // --- データ保存補助 ---
  const saveEvents = async (newEvents) => {
    if (!user || !db) return;
    if (viewMode === 'template') {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'baselines', activeBaselineId), { events: newEvents }, { merge: true });
    } else {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailySchedules', dateStr), { events: newEvents }, { merge: true });
    }
  };

  // --- アクション (日付操作) ---
  const handlePrevDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d); };
  const handleNextDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d); };
  const handlePrevMonth = () => { const d = new Date(currentDate); d.setMonth(d.getMonth() - 1); setCurrentDate(d); };
  const handleNextMonth = () => { const d = new Date(currentDate); d.setMonth(d.getMonth() + 1); setCurrentDate(d); };
  const handleToday = () => { setCurrentDate(new Date()); };

  // --- アクション (Daily テンプレート適用) ---
  const applyBaseline = async (baselineId) => {
    const baseline = baselines.find(b => b.id === baselineId);
    if (!baseline || !user || !db) return;
    const newEvents = baseline.events.map(ev => ({ ...ev, id: `e_${Date.now()}_${Math.random()}` }));
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailySchedules', dateStr), { events: newEvents });
  };
  const applyBlank = async () => {
    if (!user || !db) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailySchedules', dateStr), { events: [] });
  };

  // --- ドラッグ＆ドロップのイベント制御 ---
  useEffect(() => {
    if (!dragState) return;
    const handlePointerMove = (e) => {
      if (dragState.isLocked) return;
      const deltaY = e.clientY - dragState.initialY;
      const deltaMins = deltaY / 1.2;
      let newStartMins = Math.round((dragState.startMins + deltaMins) / 30) * 30;
      if (newStartMins < 0) newStartMins = 0;
      if (newStartMins + dragState.duration > 1440) newStartMins = 1440 - dragState.duration;
      setDragPreview({ startMins: newStartMins, endMins: newStartMins + dragState.duration });
    };

    const handlePointerUp = (e) => {
      const deltaY = e.clientY - dragState.initialY;
      const isClick = Math.abs(deltaY) < 5;
      if (isClick) {
        const ev = currentEvents?.find(event => event.id === dragState.id);
        if (ev) handleOpenEventModal(ev);
      } else if (!dragState.isLocked && dragPreview && dragState.startMins !== dragPreview.startMins) {
        const newEvents = currentEvents.map(ev => {
          if (ev.id === dragState.id) return { ...ev, startTime: minutesToTime(dragPreview.startMins), endTime: minutesToTime(dragPreview.endMins) };
          return ev;
        });
        saveEvents(newEvents);
      }
      setDragState(null);
      setDragPreview(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  }, [dragState, dragPreview, currentEvents, user, db, viewMode, activeBaselineId, dateStr]);

  // --- アクション (テンプレート管理) ---
  const handleAddBlankBaseline = async () => {
    const newId = `b_${Date.now()}`;
    if (user && db) { await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'baselines', newId), { name: '新しいテンプレート', events: [] }); }
    setActiveBaselineId(newId);
  };
  const handleAddBaseline = async () => {
    const active = baselines.find(b => b.id === activeBaselineId);
    if (!active || !user || !db) return;
    const newId = `b_${Date.now()}`;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'baselines', newId), { name: `${active.name} (コピー)`, events: active.events.map(ev => ({...ev, id: `e_${Date.now()}_${Math.random()}`})) });
    setActiveBaselineId(newId);
  };
  const handleDeleteBaseline = async () => {
    if (baselines.length <= 1) { alert('テンプレートは最低1つは残しておいてください！'); return; }
    if (user && db) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'baselines', activeBaselineId));
  };
  const handleSaveRename = async () => {
    if (renameInput.trim() !== '' && user && db) {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'baselines', activeBaselineId), { name: renameInput.trim() }, { merge: true });
    }
    setRenameModalOpen(false);
  };

  // --- アクション (予定管理) ---
  const handleOpenEventModal = (eventOrFree) => {
    if (eventOrFree.type === 'free') {
      setEditEventId(`e_${Date.now()}`); setIsNewEvent(true); setEditEventTitle('');
      setEditEventStartTime(eventOrFree.startTime); setEditEventEndTime(eventOrFree.endTime === '24:00' ? '00:00' : eventOrFree.endTime);
      setEditEventColor(THEME_COLORS[0].value); setEditEventIsLocked(false);
    } else {
      setEditEventId(eventOrFree.id); setIsNewEvent(false); setEditEventTitle(eventOrFree.title);
      setEditEventStartTime(eventOrFree.startTime); setEditEventEndTime(eventOrFree.endTime === '24:00' ? '00:00' : eventOrFree.endTime);
      setEditEventColor(eventOrFree.color || THEME_COLORS[0].value); setEditEventIsLocked(eventOrFree.isLocked || false);
    }
  };
  const handleFabClick = () => {
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const startMins = Math.ceil(nowMins / 30) * 30;
    let endMins = startMins + 60; if (endMins > 1440) endMins = 1440;
    setEditEventId(`e_${Date.now()}`); setIsNewEvent(true); setEditEventTitle('');
    setEditEventStartTime(minutesToTime(startMins === 1440 ? 0 : startMins)); setEditEventEndTime(endMins === 1440 ? '00:00' : minutesToTime(endMins));
    setEditEventColor(THEME_COLORS[0].value); setEditEventIsLocked(false);
  };
  const handleSaveEvent = async () => {
    if (timeToMinutes(editEventStartTime) >= (timeToMinutes(editEventEndTime) === 0 ? 1440 : timeToMinutes(editEventEndTime))) {
      alert("終了時間は開始時間より後にしてくださいね！"); return;
    }
    const newEventData = { id: editEventId, title: editEventTitle || '無題の予定', startTime: editEventStartTime, endTime: editEventEndTime, color: editEventColor, isLocked: editEventIsLocked };
    let newEvents = isNewEvent ? [...(currentEvents || []), newEventData] : (currentEvents || []).map(e => e.id === editEventId ? newEventData : e);
    saveEvents(newEvents);
    setEditEventId(null);
  };
  const handleDeleteEvent = async () => {
    const newEvents = (currentEvents || []).filter(e => e.id !== editEventId);
    saveEvents(newEvents);
    setEditEventId(null);
  };

  // --- UI ---
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /><p className="text-sm font-bold text-slate-500">読み込み中...</p></div>
    </div>
  );

  if (auth && !user) return (
    <div className="flex flex-col h-screen bg-slate-50 items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-sm w-full mx-4 border border-slate-100">
        <CalendarDays className="w-12 h-12 text-blue-600 mx-auto mb-4" />
        <h1 className="font-bold text-2xl text-slate-800 mb-3">My Baseline</h1>
        <p className="text-slate-500 text-sm mb-8 font-medium leading-relaxed">スケジュールを同期するには<br/>Googleでログインしてください。</p>
        <button onClick={handleGoogleLogin} className="w-full bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-sm active:scale-[0.98]">Googleでログイン</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden relative">
      
      {/* 共通ヘッダー */}
      <header className={`px-2 py-3 flex items-center justify-between shadow-sm z-10 shrink-0 ${viewMode === 'template' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-b border-slate-200'}`}>
        
        {/* 左側：ナビゲーション */}
        <div className="flex items-center gap-2 w-1/4">
          {viewMode === 'daily' && (
            <button onClick={() => setViewMode('monthly')} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded-lg transition-colors ml-1">
              <Calendar className="w-4 h-4" /><span className="hidden sm:inline">月間カレンダー</span>
            </button>
          )}
          {viewMode === 'monthly' && (
            <div className="flex items-center gap-1.5 text-blue-600 ml-2">
              <CalendarDays className="w-5 h-5" /><span className="font-bold text-sm hidden sm:inline">My Baseline</span>
            </div>
          )}
          {viewMode === 'template' && (
            <button onClick={() => setViewMode('daily')} className="flex items-center gap-1 text-xs font-bold text-slate-300 hover:text-white px-2 py-1.5 rounded-lg transition-colors ml-1">
              <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">戻る</span>
            </button>
          )}
        </div>
        
        {/* 中央：日付・テンプレート操作 */}
        <div className="flex items-center justify-center flex-1 gap-2">
          {viewMode === 'daily' && (
            <>
              <button onClick={handlePrevDay} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"><ChevronLeft className="w-5 h-5"/></button>
              <div className="flex flex-col items-center cursor-pointer" onClick={handleToday}>
                <span className="font-bold text-lg text-slate-800 leading-none">{formatDisplayDate(currentDate)}</span>
                {isSameDay(currentDate, nowDate) && <span className="text-[10px] font-bold text-blue-500 mt-0.5">今日</span>}
              </div>
              <button onClick={handleNextDay} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"><ChevronRight className="w-5 h-5"/></button>
            </>
          )}
          {viewMode === 'monthly' && (
            <>
              <button onClick={handlePrevMonth} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"><ChevronLeft className="w-5 h-5"/></button>
              <div className="flex flex-col items-center cursor-pointer" onClick={handleToday}>
                <span className="font-bold text-lg text-slate-800 leading-none">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span>
              </div>
              <button onClick={handleNextMonth} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"><ChevronRight className="w-5 h-5"/></button>
            </>
          )}
          {viewMode === 'template' && (
            <div className="flex items-center gap-1">
              <select className="bg-slate-700 border-none rounded-lg px-2 py-1.5 text-sm font-bold text-white focus:ring-2 focus:ring-blue-400 outline-none w-32 sm:w-48 text-ellipsis" value={activeBaselineId} onChange={(e) => setActiveBaselineId(e.target.value)}>
                {baselines.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <div className="flex border-l border-slate-600 pl-1 ml-1">
                <button onClick={handleAddBlankBaseline} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md" title="白紙から作成"><FilePlus className="w-4 h-4" /></button>
                <button onClick={handleAddBaseline} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md" title="現在のテンプレートを複製"><Copy className="w-4 h-4" /></button>
                <button onClick={() => { setRenameInput(baselines.find(b=>b.id===activeBaselineId)?.name || ''); setRenameModalOpen(true); }} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md" title="名前を変更"><Edit2 className="w-4 h-4" /></button>
                <button onClick={handleDeleteBaseline} disabled={baselines.length <= 1} className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-slate-700 rounded-md disabled:opacity-30" title="削除"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>

        {/* 右側：テンプレート設定・ログアウト */}
        <div className="flex items-center justify-end gap-2 w-1/4 pr-2">
          {viewMode !== 'template' && (
            <button onClick={() => setViewMode('template')} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded-lg transition-colors mr-1">
              <Settings className="w-4 h-4" /><span className="hidden sm:inline">テンプレート</span>
            </button>
          )}
          <Cloud className={`w-4 h-4 hidden sm:block ${viewMode === 'template' ? 'text-emerald-400' : 'text-emerald-500'}`} title="クラウド同期中" />
          <button onClick={handleLogout} className={`p-1.5 rounded-full transition-colors ${viewMode === 'template' ? 'text-slate-400 hover:bg-slate-700 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`} title="ログアウト"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      {/* メインエリア */}
      <main className={`flex-1 overflow-y-auto px-4 py-4 pb-24 ${viewMode === 'template' ? 'bg-slate-100' : ''}`}>
        
        {/* --- 月間カレンダーモード --- */}
        {viewMode === 'monthly' && (
          <div className="max-w-4xl mx-auto w-full h-full flex flex-col">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                <div key={d} className={`text-center text-xs font-bold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</div>
              ))}
            </div>
            {/* カレンダーのマス目 */}
            <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-1 pb-4">
              {generateMonthGrid(currentDate).map((week, wIdx) => 
                week.map((dateObj, dIdx) => {
                  if (!dateObj) return <div key={`empty-${wIdx}-${dIdx}`} className="bg-transparent rounded-lg"></div>;
                  
                  const dStr = getYYYYMMDD(dateObj);
                  const isToday = isSameDay(dateObj, nowDate);
                  const dayEvents = dailySchedules[dStr]; // 未設定なら undefined
                  
                  return (
                    <div 
                      key={dStr} 
                      onClick={() => { setCurrentDate(dateObj); setViewMode('daily'); }} 
                      className={`bg-white border rounded-lg p-1 sm:p-1.5 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all flex flex-col overflow-hidden ${isToday ? 'border-blue-300 shadow-sm ring-1 ring-blue-100' : 'border-slate-200'}`}
                    >
                      {/* 日付の数字 */}
                      <div className="flex justify-center mb-1">
                        <span className={`text-[10px] sm:text-xs font-bold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : (dIdx === 0 ? 'text-red-500' : dIdx === 6 ? 'text-blue-500' : 'text-slate-700')}`}>
                          {dateObj.getDate()}
                        </span>
                      </div>
                      
                      {/* その日の予定の簡易表示 */}
                      <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                        {dayEvents === undefined ? (
                          <div className="w-full h-full flex items-center justify-center pt-2 sm:pt-0">
                            <span className="text-[9px] text-slate-300 font-medium">未設定</span>
                          </div>
                        ) : (
                          <>
                            {dayEvents.slice(0, 4).map((ev, i) => (
                              <div key={i} className={`text-[8px] sm:text-[9px] px-1 py-0.5 truncate rounded border border-black/5 leading-tight ${ev.color}`}>
                                {ev.title}
                              </div>
                            ))}
                            {dayEvents.length > 4 && (
                              <div className="text-[8px] text-slate-400 font-bold text-center mt-0.5">+{dayEvents.length - 4}</div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* --- デイリー ＆ テンプレート モード --- */}
        {(viewMode === 'daily' || viewMode === 'template') && (
          <div className="max-w-md mx-auto space-y-2">
            
            {/* デイリーモードで予定未作成のときのウェルカム画面 */}
            {viewMode === 'daily' && currentEvents === undefined ? (
              <div className="flex flex-col items-center justify-center pt-10 pb-20">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <CalendarDays className="w-8 h-8 text-blue-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">予定がありません</h2>
                <p className="text-slate-500 text-sm mb-8 text-center">この日のスケジュールはまだ空っぽです。<br/>テンプレートを選んで予定を作りましょう！</p>
                
                <div className="w-full space-y-3">
                  {baselines.map(b => (
                    <button key={b.id} onClick={() => applyBaseline(b.id)} className="w-full bg-white border-2 border-blue-100 text-blue-600 font-bold py-4 px-4 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-all flex items-center justify-between shadow-sm">
                      <span>{b.name} を適用する</span>
                      <ChevronRight className="w-5 h-5 opacity-50" />
                    </button>
                  ))}
                  <div className="pt-4">
                    <button onClick={applyBlank} className="w-full bg-transparent text-slate-500 font-bold py-3 px-4 rounded-xl hover:bg-slate-200 transition-colors">
                      白紙からスケジュールを作る
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* 通常のタイムライン表示 */
              timelineBlocks.map((block) => {
                const heightPx = Math.max(block.durationMinutes * 1.2, 48);
                const startMins = timeToMinutes(block.startTime);
                const endMins = timeToMinutes(block.endTime) === 0 && block.endTime === '00:00' ? 1440 : timeToMinutes(block.endTime);
                const isCurrentTimeInSlot = isTodayView && currentMinutes >= startMins && currentMinutes < endMins;
                const progressPercent = isCurrentTimeInSlot ? ((currentMinutes - startMins) / block.durationMinutes) * 100 : 0;

                return (
                  <div key={block.id} className="flex gap-3 relative">
                    <div className="w-12 shrink-0 flex flex-col items-end text-xs text-slate-400 font-medium pt-2">
                      <span>{block.startTime}</span>
                    </div>

                    <div className="flex-1 relative">
                      {/* 現在時刻バー（今日だけ表示） */}
                      {isCurrentTimeInSlot && (
                        <div className="absolute left-[-56px] right-0 z-10 flex items-center pointer-events-none" style={{ top: `${progressPercent}%`, transform: 'translateY(-50%)' }}>
                          <div className="text-[10px] font-bold text-red-500 bg-white/90 px-1 rounded shadow-sm mr-1 border border-red-100">NOW</div>
                          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                          <div className="flex-1 h-[2px] bg-red-500/80 shadow-[0_0_4px_rgba(239,68,68,0.5)]"></div>
                        </div>
                      )}

                      {block.type === 'free' ? (
                        <div style={{ height: `${heightPx}px` }} onClick={() => handleOpenEventModal(block)} className="w-full rounded-xl border-2 border-dashed border-blue-200 bg-white/50 flex flex-col justify-center items-center cursor-pointer hover:bg-blue-50 transition-colors group">
                          <span className="text-sm font-bold text-blue-300 group-hover:text-blue-500">＋ 予定を追加</span>
                          <span className="text-xs font-medium text-blue-300 mt-1">{block.durationMinutes}分</span>
                        </div>
                      ) : (
                        <div className="relative w-full" style={{ height: `${heightPx}px` }}>
                          {block.events.map((ev, idx) => {
                            const startOffset = timeToMinutes(ev.startTime) - timeToMinutes(block.startTime);
                            const evEndMins = timeToMinutes(ev.endTime) === 0 && ev.endTime === '00:00' ? 1440 : timeToMinutes(ev.endTime);
                            const duration = evEndMins - timeToMinutes(ev.startTime);
                            const widthPct = 100 / block.events.length;
                            const leftPct = idx * widthPct;
                            const topPx = block.durationMinutes > 0 ? (startOffset / block.durationMinutes) * heightPx : 0;
                            const evHeightPx = block.durationMinutes > 0 ? (duration / block.durationMinutes) * heightPx : heightPx;
                            
                            const borderStyle = ev.isLocked ? 'border border-black/5 opacity-50 shadow-none' : 'border-2 border-black/5 hover:brightness-95 shadow-sm';
                            const dragStyle = ev.isDragging ? 'scale-105 shadow-xl ring-2 ring-blue-400 z-50 opacity-90' : 'z-10';
                            const isShort = duration <= 30;

                            return (
                              <div key={ev.id}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  setDragState({ id: ev.id, isLocked: ev.isLocked, startMins: timeToMinutes(ev.startTime), duration: timeToMinutes(ev.endTime === '00:00' ? '24:00' : ev.endTime) - timeToMinutes(ev.startTime), initialY: e.clientY });
                                  setDragPreview({ startMins: timeToMinutes(ev.startTime), endMins: timeToMinutes(ev.endTime === '00:00' ? '24:00' : ev.endTime) });
                                  e.currentTarget.setPointerCapture(e.pointerId);
                                }}
                                className={`absolute rounded-xl flex overflow-hidden transition-all duration-200 ${isShort ? 'flex-row items-center px-2 py-1 gap-1' : 'flex-col p-2'} ${ev.color} ${borderStyle} ${dragStyle} ${!ev.isLocked ? 'cursor-grab active:cursor-grabbing touch-none select-none' : 'cursor-pointer'}`}
                                style={{ top: `${topPx}px`, height: `${evHeightPx}px`, width: `calc(${widthPct}% - 4px)`, left: `calc(${leftPct}% + 2px)` }}
                              >
                                {isShort ? (
                                  <>
                                    <span className="font-bold text-[12px] truncate flex-1 leading-tight pointer-events-none">{ev.title}</span>
                                    <span className="text-[9px] opacity-80 font-medium shrink-0 pointer-events-none">{ev.startTime} ({duration}分)</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="flex justify-between items-start mb-1 pointer-events-none">
                                      <span className="font-bold text-[13px] leading-tight line-clamp-2">{ev.title}</span>
                                    </div>
                                    <div className="text-[10px] opacity-80 flex items-center gap-1 mt-auto font-medium pointer-events-none">
                                      <Clock className="w-2.5 h-2.5" />{ev.startTime}-{ev.endTime} <span className="ml-1">({duration}分)</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* --- フローティング追加ボタン（予定がある時＆月間モード以外の時だけ） --- */}
      {viewMode !== 'monthly' && currentEvents !== undefined && (
        <button onClick={handleFabClick} className={`fixed bottom-6 right-6 w-14 h-14 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all z-30 ${viewMode === 'template' ? 'bg-slate-700 hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-700'}`} title="予定を追加">
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* --- モーダル群 --- */}
      {renameModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-3 text-slate-800">テンプレート名の変更</h3>
            <input type="text" value={renameInput} onChange={(e) => setRenameInput(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 mb-4 focus:border-blue-500 outline-none" autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRenameModalOpen(false)} className="px-4 py-2 text-slate-600 font-medium bg-slate-100 rounded-xl">キャンセル</button>
              <button onClick={handleSaveRename} className="px-4 py-2 text-white font-medium bg-blue-600 rounded-xl">保存</button>
            </div>
          </div>
        </div>
      )}

      {editEventId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800">{isNewEvent ? '新しい予定を追加' : '予定の編集'}</h3>
              <button onClick={() => setEditEventId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            
            <label className={`flex items-center justify-between mb-5 p-3 rounded-xl border-2 cursor-pointer transition-colors ${editEventIsLocked ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200'}`}>
              <div>
                <span className="font-bold text-sm text-slate-800 block">予定をロックする</span>
                <span className="text-xs text-slate-500">誤って変更や削除されるのを防ぎます</span>
              </div>
              <input type="checkbox" checked={editEventIsLocked} onChange={(e) => setEditEventIsLocked(e.target.checked)} className="w-5 h-5 accent-slate-600 rounded" />
            </label>

            <div className={`transition-opacity ${editEventIsLocked ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <label className="block text-sm font-bold text-slate-700 mb-1">タイトル</label>
              <input type="text" value={editEventTitle} onChange={(e) => setEditEventTitle(e.target.value)} placeholder="例: ミーティング" disabled={editEventIsLocked} className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 mb-4 focus:border-blue-500 outline-none disabled:bg-slate-50" />
              <div className="flex gap-2 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">開始</label>
                  <input type="time" value={editEventStartTime} onChange={(e) => setEditEventStartTime(e.target.value)} disabled={editEventIsLocked} className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 font-mono text-center outline-none focus:border-blue-500 disabled:bg-slate-50" />
                </div>
                <div className="flex items-center pt-6 font-bold text-slate-400">〜</div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">終了</label>
                  <input type="time" value={editEventEndTime} onChange={(e) => setEditEventEndTime(e.target.value)} disabled={editEventIsLocked} className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 font-mono text-center outline-none focus:border-blue-500 disabled:bg-slate-50" />
                </div>
              </div>
              <label className="block text-sm font-bold text-slate-700 mb-2">カラー</label>
              <div className="flex gap-2 flex-wrap mb-6">
                {THEME_COLORS.map(c => (
                  <button key={c.id} onClick={() => setEditEventColor(c.value)} disabled={editEventIsLocked} className={`w-8 h-8 rounded-full border-2 transition-all ${c.value.split(' ')[0]} ${editEventColor === c.value ? 'ring-2 ring-slate-800 ring-offset-2 scale-110' : 'border-transparent'} disabled:cursor-not-allowed`} />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={handleSaveEvent} className="w-full py-3 text-white font-bold bg-blue-600 rounded-xl hover:bg-blue-700">保存する</button>
              {!isNewEvent && (
                <button onClick={handleDeleteEvent} disabled={editEventIsLocked} className="w-full py-3 text-rose-600 font-bold bg-rose-50 rounded-xl hover:bg-rose-100 flex justify-center items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"><Trash2 className="w-4 h-4" />削除する</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

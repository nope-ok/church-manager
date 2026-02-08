
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- CONSTANTS ---
const FORM_DRAFT_KEY = 'member_form_draft_v3';
const LAST_AUTHOR_KEY = 'last_author_v3';
const APPS_SCRIPT_URL_KEY = 'apps_script_url_v3';
const SHEET_URL_KEY = 'google_sheet_url_v3';

const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1jbeyGUv0Xtvzf1HGLyb-loZY8BzVdUxA5vupH1UK0E/edit?usp=sharing";

// --- TYPES & INTERFACES ---
export interface Member {
  name: string;
  spouseName?: string;
  attendanceCount: number;
  attendedRounds: number[]; 
  region: string;
  details: string; 
  status: 'TARGET' | 'ONGOING' | 'COMPLETED';
}

export interface AnalysisResult {
  placementTargets: Member[];
  placedMembers: Member[];
  ongoingMembers: Member[];
  completedMembers: Member[];
  totalAttendanceRecords: number;
}

export enum TabType {
  DASHBOARD = 'dashboard',
  TARGETS = 'targets',
  PLACED = 'placed',
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  IMPORT = 'import',
  ADMIN = 'admin'
}

interface FormEntry {
  author: string;
  name: string;
  spouseName: string;
  date: string;
  classType: string;
  round: string;
  residence: string;
  preference: string;
  notes: string;
  timestamp?: string; 
}

// --- RICH TEXT EDITOR COMPONENT ---
const RichTextEditor: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  const execCommand = (command: string, val: string | undefined = undefined) => {
    document.execCommand(command, false, val);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-purple-500 transition-all relative">
      <div className="flex items-center space-x-1 p-2 bg-gray-50 border-b border-gray-100">
        <button type="button" onClick={() => execCommand('bold')} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded transition-colors text-gray-600 font-bold">B</button>
        <button type="button" onClick={() => execCommand('italic')} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded transition-colors text-gray-600 italic">I</button>
        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <button type="button" onClick={() => execCommand('insertUnorderedList')} className="px-2 h-8 flex items-center justify-center hover:bg-white rounded transition-colors text-gray-600 text-xs font-bold">List</button>
      </div>
      <div ref={editorRef} contentEditable onInput={handleInput} className="p-4 min-h-[120px] outline-none text-sm text-gray-700 prose prose-sm max-w-none" />
      {(!value || value === '<br>' || value === '') && (
        <div className="absolute top-[52px] left-4 pointer-events-none text-gray-400 text-sm">
          {placeholder}
        </div>
      )}
    </div>
  );
};

// --- CORE SERVICES ---
const analyzeSheetData = async (rawData: string): Promise<AnalysisResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is not configured.");
  
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze church attendance CSV data and categorize people correctly. Use 'spouseName' if suggested in notes.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          placementTargets: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING } } } },
          placedMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING } } } },
          ongoingMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING } } } },
          completedMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING } } } },
          totalAttendanceRecords: { type: Type.NUMBER }
        },
        required: ["placementTargets", "placedMembers", "ongoingMembers", "completedMembers", "totalAttendanceRecords"]
      }
    }
  });
  return JSON.parse(response.text.trim()) as AnalysisResult;
};

const fetchSheetCSV = async (url: string) => {
  if (!url) throw new Error("구글 시트 URL이 설정되지 않았습니다.");
  const mid = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!mid) throw new Error("유효한 구글 시트 URL 형식이 아닙니다.");
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${mid[1]}/export?format=csv&cachebust=${Date.now()}`);
  if (!res.ok) throw new Error("시트 접근 권한이 없습니다.");
  return res.text();
};

const sendToAppsScript = async (entries: any[], url: string) => {
  if (!url) throw new Error("Apps Script URL이 설정되지 않았습니다.");
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(entries)
  });
};

const getTheme = (reg: string) => {
  if (reg?.includes('알파')) return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', accent: 'bg-indigo-600', hover: 'hover:bg-indigo-700' };
  if (reg?.includes('시에라')) return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', accent: 'bg-emerald-600', hover: 'hover:bg-emerald-700' };
  return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', accent: 'bg-slate-600', hover: 'hover:bg-slate-700' };
};

const MemberCard: React.FC<{ member: Member, onEdit: (m: Member) => void, onPlace: (m: Member) => void }> = ({ member, onEdit, onPlace }) => {
  const theme = getTheme(member.region);
  const isPlaced = member.details.includes('[배치완료');
  const canPlace = !isPlaced && member.attendanceCount >= 4;

  return (
    <div className={`p-5 rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${canPlace ? 'border-purple-300 ring-2 ring-purple-50' : 'border-gray-100'}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h4 className="text-lg font-black text-gray-900">{member.name}</h4>
            {member.spouseName && <span className="text-[10px] bg-rose-50 text-rose-500 px-2 py-0.5 rounded-lg border border-rose-100 font-bold">👫 {member.spouseName}</span>}
            <button onClick={() => onEdit(member)} className="text-gray-300 hover:text-purple-600 p-1"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg></button>
          </div>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block mt-1 ${theme.bg} ${theme.text}`}>{member.region || '미지정 지부'}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${isPlaced ? 'bg-emerald-100 text-emerald-600' : 'bg-purple-100 text-purple-600'}`}>
            {isPlaced ? '순 배치완료' : `${member.attendanceCount}회 수강`}
          </span>
        </div>
      </div>
      <div className="flex space-x-1 mb-4">
        {[1,2,3,4,5,6,7,8].map(n => <div key={n} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${member.attendedRounds.includes(n) ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-300'}`}>{n}</div>)}
      </div>
      <div className="text-[11px] text-gray-500 italic mb-4 line-clamp-2 min-h-[3em] prose prose-sm max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: member.details }} />
      {canPlace ? (
        <button onClick={() => onPlace(member)} className="w-full py-3 bg-purple-600 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all active:scale-95">순 배치하기</button>
      ) : (
        <div className="w-full py-3 bg-gray-50 text-gray-300 text-center rounded-xl text-xs font-bold border border-gray-100">
          {isPlaced ? '이미 배치됨' : '4회 이상 시 배치 가능'}
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [activeTab, setActiveTab] = useState<TabType>(TabType.IMPORT);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncTime, setSyncTime] = useState('-');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'none'>('none');
  const [errorMessage, setErrorMessage] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [scriptUrl, setScriptUrl] = useState(() => localStorage.getItem(APPS_SCRIPT_URL_KEY) || '');
  const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem(SHEET_URL_KEY) || DEFAULT_SHEET_URL);
  
  const [form, setForm] = useState<FormEntry>(() => {
    const d = localStorage.getItem(FORM_DRAFT_KEY);
    return d ? JSON.parse(d) : { author: localStorage.getItem(LAST_AUTHOR_KEY) || '', name: '', spouseName: '', date: new Date().toISOString().split('T')[0], classType: '2부 A반', round: '1', residence: '', preference: '', notes: '' };
  });

  const [editing, setEditing] = useState<Member | null>(null);
  const [placing, setPlacing] = useState<Member | null>(null);
  const [groupName, setGroupName] = useState('');

  useEffect(() => { localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(form)); }, [form]);
  useEffect(() => { doSync(); }, []);

  const allKnownMembers = useMemo(() => {
    if (!result) return [];
    return [...result.placementTargets, ...result.placedMembers, ...result.ongoingMembers, ...result.completedMembers];
  }, [result]);

  const doSync = async () => {
    setIsSyncing(true);
    setErrorMessage('');
    try {
      const csv = await fetchSheetCSV(sheetUrl);
      const data = await analyzeSheetData(csv);
      setResult(data);
      setSyncTime(new Date().toLocaleTimeString());
      setConnectionStatus('connected');
    } catch (e: any) {
      setConnectionStatus('error');
      setErrorMessage(e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleNameChange = (name: string) => {
    let newSpouse = form.spouseName;
    if (name.length >= 2) {
      const found = allKnownMembers.find(m => m.name === name);
      if (found && found.spouseName) {
        newSpouse = found.spouseName;
      }
    }
    setForm({ ...form, name, spouseName: newSpouse });
  };

  const handleSave = async (entry: FormEntry = form) => {
    if (!entry.name.trim() || !entry.author.trim()) return alert("성함과 작성자 성함은 필수입니다.");
    setIsSaving(true);
    try {
      await sendToAppsScript([entry], scriptUrl);
      localStorage.setItem(LAST_AUTHOR_KEY, entry.author);
      if (entry === form) setForm({ ...form, name: '', spouseName: '', residence: '', preference: '', notes: '' });
      setEditing(null);
      setPlacing(null);
      setGroupName('');
      setTimeout(doSync, 2000);
    } catch (e: any) {
      alert("저장 실패: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const NavItem = ({ id, label, icon }: any) => (
    <button onClick={() => { setActiveTab(id); setIsMobileMenuOpen(false); }} className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all ${activeTab === id ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}>
      <span className="text-lg">{icon}</span><span className="font-bold text-sm">{label}</span>
    </button>
  );

  const Section = ({ title, members, icon }: any) => (
    <div className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6 border-b pb-3 border-gray-100">
        <div className="flex items-center space-x-3"><span className="text-2xl">{icon}</span><h3 className="text-xl font-black text-gray-800">{title}</h3></div>
        <span className="text-xs font-black bg-gray-100 px-3 py-1 rounded-full text-gray-500">{members.length}명</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((m: any, i: number) => <MemberCard key={i} member={m} onEdit={setEditing} onPlace={setPlacing} />)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900 font-sans">
      
      {/* Mobile Top Navigation Bar */}
      <header className="md:hidden sticky top-0 z-[60] bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-black text-[10px] shadow-lg">1516</div>
          <span className="font-black text-sm text-gray-800">새가족 관리 비서</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">
          {isMobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          )}
        </button>
      </header>

      {/* Mobile Menu Overlay Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[55] animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="absolute top-0 left-0 bottom-0 w-72 bg-white shadow-2xl p-8 animate-in slide-in-from-left duration-300 overflow-y-auto">
            <div className="mb-10 flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-black text-xs">1516</div>
              <h1 className="font-black text-base">새가족 관리 비서</h1>
            </div>
            <nav className="space-y-1">
              <NavItem id={TabType.IMPORT} label="출석 입력" icon="📥" />
              <NavItem id={TabType.DASHBOARD} label="현황 요약" icon="📊" />
              <NavItem id={TabType.TARGETS} label="배치 대상" icon="✨" />
              <NavItem id={TabType.PLACED} label="배치 완료" icon="✅" />
              <NavItem id={TabType.ONGOING} label="교육 중" icon="🌱" />
              <div className="pt-6 mt-6 border-t border-gray-100">
                <NavItem id={TabType.ADMIN} label="관리자 설정" icon="⚙️" />
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Desktop Sidebar Navigation */}
      <nav className="w-72 bg-white border-r border-gray-200 p-8 flex flex-col fixed h-full z-40 hidden md:flex">
        <div className="mb-10 flex items-center space-x-3">
          <div className="w-12 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-lg">1516</div>
          <h1 className="font-black text-lg leading-tight">새가족 관리<br/><span className="text-purple-600 text-xs font-bold uppercase tracking-widest">Assistant</span></h1>
        </div>
        
        <div className={`mb-8 p-4 rounded-2xl border flex flex-col space-y-2 ${connectionStatus === 'connected' ? 'bg-emerald-50 border-emerald-100' : connectionStatus === 'error' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">연동 상태</span>
            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : connectionStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-300'}`}></div>
          </div>
          <p className={`text-sm font-black ${connectionStatus === 'connected' ? 'text-emerald-700' : connectionStatus === 'error' ? 'text-red-700' : 'text-gray-400'}`}>
            {connectionStatus === 'connected' ? '시트 연동됨' : connectionStatus === 'error' ? '연결 오류' : '설정 필요'}
          </p>
          <span className="text-[10px] text-gray-400 font-bold">동기화: {syncTime}</span>
        </div>

        <div className="space-y-1 flex-1">
          <NavItem id={TabType.IMPORT} label="출석 입력" icon="📥" />
          <NavItem id={TabType.DASHBOARD} label="현황 요약" icon="📊" />
          <NavItem id={TabType.TARGETS} label="배치 대상" icon="✨" />
          <NavItem id={TabType.PLACED} label="배치 완료" icon="✅" />
          <NavItem id={TabType.ONGOING} label="교육 중" icon="🌱" />
        </div>
        
        <button onClick={() => setActiveTab(TabType.ADMIN)} className={`mt-8 text-[10px] font-black transition-colors py-2 border rounded-xl ${activeTab === TabType.ADMIN ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'text-gray-400 border-gray-100 hover:text-purple-600 hover:bg-gray-50'}`}>⚙️ 관리자 설정</button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-72 p-6 md:p-12 min-h-screen">
        <div className="max-w-6xl mx-auto">
          <datalist id="names-list">
            {allKnownMembers.map((m, i) => <option key={i} value={m.name} />)}
          </datalist>

          {isSyncing && (
            <div className="fixed bottom-6 right-6 md:top-6 md:bottom-auto z-[100] bg-white/80 backdrop-blur shadow-2xl rounded-2xl p-4 border flex items-center space-x-3 animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-right-4">
              <div className="w-5 h-5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
              <span className="text-xs font-black text-purple-900">데이터 분석 중...</span>
            </div>
          )}

          {activeTab === TabType.IMPORT && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in duration-500">
              <div className="lg:col-span-7 bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
                <div className="flex justify-between items-end border-b border-gray-50 pb-6">
                  <h3 className="font-black text-xl md:text-2xl text-gray-800">새가족 출석 입력</h3>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">작성자</p>
                    <input type="text" value={form.author} onChange={e => setForm({...form, author: e.target.value})} className="p-2 border border-purple-100 rounded-xl text-xs font-black w-24 md:w-28 text-center bg-purple-50 outline-none focus:ring-2 focus:ring-purple-200" placeholder="성함" />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><p className="text-[11px] font-black text-gray-400 ml-1">이름</p><input list="names-list" type="text" value={form.name} onChange={e => handleNameChange(e.target.value)} className="w-full p-4 bg-gray-50 border-0 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 transition-all" placeholder="성함" /></div>
                  <div className="space-y-2"><p className="text-[11px] font-black text-gray-400 ml-1">배우자</p><input type="text" value={form.spouseName} onChange={e => setForm({...form, spouseName: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl outline-none" placeholder="배우자 성함 (선택)" /></div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><p className="text-[11px] font-black text-gray-400 ml-1">출석 날짜</p><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl outline-none" /></div>
                  <div className="space-y-2"><p className="text-[11px] font-black text-gray-400 ml-1 uppercase">수강 주차</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[1,2,3,4,5,6,7,8].map(n => <button key={n} onClick={() => setForm({...form, round: n.toString()})} className={`w-9 h-9 rounded-xl text-xs font-black border transition-all ${form.round === n.toString() ? 'bg-purple-600 text-white shadow-md border-purple-600' : 'bg-white text-gray-400 border-gray-100 hover:border-purple-300'}`}>{n}</button>)}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <p className="text-[11px] font-black text-gray-400 ml-1">순 배치 선호사항</p>
                  <div className="flex flex-wrap gap-2">
                    {["부부순", "부부순-자녀나이대", "자매순-평일", "자매순-주말", "4050", "청년부", "기타"].map(p => (
                      <button key={p} onClick={() => setForm({...form, preference: p})} className={`px-4 py-2 text-[10px] font-black rounded-xl border transition-all ${form.preference === p ? 'bg-purple-600 text-white shadow-md border-purple-600' : 'bg-white text-gray-400 border-gray-100 hover:border-purple-300'}`}>{p}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-black text-gray-400 ml-1">거주 지역</p>
                  <div className="flex flex-wrap gap-2">{["정자동","금곡동","구미동","동원동","궁내동"].map(z => <button key={z} onClick={() => setForm({...form, residence: z})} className={`px-4 py-2 text-[11px] font-black rounded-xl border transition-all ${form.residence === z ? 'bg-purple-600 text-white shadow-md border-purple-600' : 'bg-white text-gray-400 border-gray-100 hover:border-purple-300'}`}>{z}</button>)}</div>
                </div>
                
                <div className="space-y-3">
                  <p className="text-[11px] font-black text-gray-400 ml-1">특이사항</p>
                  <RichTextEditor value={form.notes} onChange={v => setForm({...form, notes: v})} placeholder="특이사항, 가족관계 등..." />
                </div>
                
                <button disabled={isSaving} onClick={() => handleSave()} className={`w-full py-5 text-white font-black rounded-[1.5rem] shadow-2xl transition-all active:scale-[0.98] ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-200'}`}>
                  {isSaving ? "데이터 전송 중..." : "명단 추가하기"}
                </button>
              </div>
              
              <div className="lg:col-span-5 flex flex-col space-y-6">
                <div className="bg-white p-8 rounded-[2rem] md:rounded-[2.5rem] border border-gray-100 shadow-sm flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-lg">기록 가이드</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    <div className="p-6 bg-purple-50 rounded-2xl border border-purple-100">
                      <p className="text-[11px] font-bold text-purple-800 leading-relaxed">
                        💡 팁: 이름을 2글자 이상 입력하면 등록된 명단에서 자동으로 추천됩니다. 기존에 배우자 정보가 있는 경우 자동으로 입력되니 확인 후 수정해 주세요.
                      </p>
                    </div>
                    {result && result.totalAttendanceRecords > 0 ? (
                      <div className="text-center py-20 opacity-30 flex flex-col items-center">
                        <span className="text-4xl mb-4">📜</span>
                        <p className="text-sm font-bold">전체 데이터는 시트에서<br/>영구 관리됩니다.</p>
                      </div>
                    ) : <p className="text-center text-gray-300 py-10">데이터 로드 중...</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && activeTab === TabType.DASHBOARD && (
            <div className="space-y-12 animate-in fade-in duration-700">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                <div className="bg-purple-600 p-6 md:p-8 rounded-[2rem] text-white shadow-2xl shadow-purple-200 cursor-pointer transition-transform hover:scale-105" onClick={() => setActiveTab(TabType.TARGETS)}>
                  <p className="text-[10px] md:text-xs font-bold opacity-70 mb-1 uppercase tracking-widest">배치 대기</p>
                  <p className="text-2xl md:text-4xl font-black">{result.placementTargets.length} <span className="text-sm md:text-lg opacity-80">명</span></p>
                </div>
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm"><p className="text-[10px] md:text-xs font-bold text-gray-400 mb-1">배치 완료</p><p className="text-2xl md:text-4xl font-black text-gray-800">{result.placedMembers.length} <span className="text-sm md:text-lg opacity-50">명</span></p></div>
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm"><p className="text-[10px] md:text-xs font-bold text-gray-400 mb-1">교육 진행</p><p className="text-2xl md:text-4xl font-black text-gray-800">{result.ongoingMembers.length} <span className="text-sm md:text-lg opacity-50">명</span></p></div>
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm"><p className="text-[10px] md:text-xs font-bold text-gray-400 mb-1">전체 데이터</p><p className="text-2xl md:text-4xl font-black text-gray-800">{result.totalAttendanceRecords} <span className="text-sm md:text-lg opacity-50">건</span></p></div>
              </div>
              <Section title="지금 순 배치가 필요한 성도" members={result.placementTargets} icon="✨" />
            </div>
          )}

          {result && activeTab === TabType.TARGETS && <Section title="배치 대기 명단" members={result.placementTargets} icon="✨" />}
          {result && activeTab === TabType.PLACED && <Section title="배치 완료 명단" members={result.placedMembers} icon="✅" />}
          {result && activeTab === TabType.ONGOING && <Section title="교육 진행 명단" members={result.ongoingMembers} icon="🌱" />}
          {result && activeTab === TabType.COMPLETED && <Section title="수료 완료 명단" members={result.completedMembers} icon="🎓" />}

          {activeTab === TabType.ADMIN && (
            <div className="bg-white p-6 md:p-12 rounded-[2rem] md:rounded-[2.5rem] border border-gray-100 shadow-sm max-w-2xl mx-auto space-y-10 animate-in zoom-in duration-300">
              <h2 className="text-2xl font-black text-gray-800">시스템 설정</h2>
              <div className="space-y-8">
                <div className="p-6 md:p-8 bg-purple-50 rounded-[2rem] border border-purple-100">
                  <p className="text-sm font-black text-purple-800 mb-4 flex items-center"><span className="mr-2">📊</span> 구글 시트 URL (조회)</p>
                  <input type="text" value={sheetUrl} onChange={e => { setSheetUrl(e.target.value); localStorage.setItem(SHEET_URL_KEY, e.target.value); }} className="w-full p-4 md:p-5 border-0 bg-white rounded-2xl text-[10px] font-mono outline-none focus:ring-2 focus:ring-purple-500 shadow-sm" placeholder="URL 입력" />
                </div>
                <div className="p-6 md:p-8 bg-emerald-50 rounded-[2rem] border border-emerald-100">
                  <p className="text-sm font-black text-emerald-800 mb-4 flex items-center"><span className="mr-2">🔗</span> Apps Script URL (저장)</p>
                  <input type="text" value={scriptUrl} onChange={e => { setScriptUrl(e.target.value); localStorage.setItem(APPS_SCRIPT_URL_KEY, e.target.value); }} className="w-full p-4 md:p-5 border-0 bg-white rounded-2xl text-[10px] font-mono outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" placeholder="URL 입력" />
                </div>
                <button onClick={() => { doSync(); alert('적용되었습니다.'); }} className="w-full py-4 bg-purple-600 text-white font-black rounded-2xl shadow-lg">설정 적용 및 동기화</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {editing && (
        <div className="fixed inset-0 z-[999] bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <div className="p-8 bg-purple-600 text-white flex justify-between items-center">
              <h3 className="text-xl font-black">{editing.name}님 정보 수정</h3>
              <button onClick={() => setEditing(null)} className="text-3xl font-light hover:rotate-90 transition-transform">&times;</button>
            </div>
            <div className="p-10 space-y-6">
              <div className="space-y-1"><p className="text-[11px] font-black text-gray-400 ml-1">배우자 성함</p><input type="text" value={editing.spouseName || ''} onChange={e => setEditing({...editing, spouseName: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl outline-none" placeholder="배우자" /></div>
              <div className="space-y-1"><p className="text-[11px] font-black text-gray-400 ml-1">노트 수정</p><RichTextEditor value={editing.details} onChange={v => setEditing({...editing, details: v})} placeholder="수정할 내용을 입력하세요..." /></div>
              <div className="flex space-x-4 pt-4"><button onClick={() => setEditing(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl">취소</button><button disabled={isSaving} onClick={() => handleSave({ author: form.author, name: editing.name, spouseName: editing.spouseName || '', date: new Date().toISOString().split('T')[0], classType: '정보수정', round: '0', residence: editing.region, preference: '', notes: editing.details })} className="flex-[2] py-4 bg-purple-600 text-white font-black rounded-2xl shadow-xl shadow-purple-100">{isSaving ? '업데이트 중...' : '변경사항 저장'}</button></div>
            </div>
          </div>
        </div>
      )}

      {placing && (
        <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <div className={`p-8 ${getTheme(placing.region).accent} text-white text-center`}>
              <p className="text-[10px] font-black opacity-70 uppercase tracking-widest mb-1">Small Group Placement</p>
              <h3 className="text-2xl font-black">{placing.name} 성도님</h3>
            </div>
            <div className="p-10 space-y-8">
              <div className="space-y-2"><p className="text-center text-sm font-bold text-gray-400 uppercase">배치할 순 이름 입력</p><input autoFocus type="text" value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-3xl outline-none text-center text-2xl font-black focus:border-purple-500 transition-all" placeholder="예: 정자 1순" onKeyPress={e => e.key === 'Enter' && groupName.trim() && handleSave({ author: form.author, name: placing.name, spouseName: placing.spouseName || '', date: new Date().toISOString().split('T')[0], classType: '순배치', round: '0', residence: placing.region, preference: '', notes: `[배치완료: ${groupName}] ${placing.details}` })} /></div>
              <div className="flex space-x-4"><button onClick={() => setPlacing(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl">취소</button><button disabled={isSaving || !groupName.trim()} onClick={() => handleSave({ author: form.author, name: placing.name, spouseName: placing.spouseName || '', date: new Date().toISOString().split('T')[0], classType: '순배치', round: '0', residence: placing.region, preference: '', notes: `[배치완료: ${groupName}] ${placing.details}` })} className={`flex-[2] py-4 ${getTheme(placing.region).accent} text-white font-black rounded-2xl shadow-xl`}>{isSaving ? "처리 중..." : "배치 확정"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = document.getElementById('root');
if (root) ReactDOM.createRoot(root).render(<App />);

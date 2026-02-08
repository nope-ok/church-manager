
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- CONSTANTS ---
const FORM_DRAFT_KEY = 'member_form_draft_v2';
const LAST_AUTHOR_KEY = 'last_author_v2';
const APPS_SCRIPT_URL_KEY = 'apps_script_url_v2';

// --- TYPES & INTERFACES ---
export interface Member {
  name: string;
  spouseName?: string;
  attendanceCount: number;
  attendedRounds: number[];
  region: string;
  details: string; 
  status: 'TARGET' | 'ONGOING' | 'COMPLETED';
  lastAuthor?: string; 
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
        <button type="button" onClick={() => execCommand('bold')} className="p-1.5 hover:bg-white rounded transition-colors text-gray-600 font-bold">B</button>
        <button type="button" onClick={() => execCommand('italic')} className="p-1.5 hover:bg-white rounded transition-colors text-gray-600 italic">I</button>
        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <button type="button" onClick={() => execCommand('insertUnorderedList')} className="p-1.5 hover:bg-white rounded transition-colors text-gray-600">List</button>
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
  // CRITICAL: Initialize GoogleGenAI ONLY inside the function to avoid browser-level key errors
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing in environment.");
  
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `
      Analyze church attendance CSV data. 
      Rules:
      1. Identify unique people. Link spouses if mentioned.
      2. 'attendedRounds': Unique round numbers (1-8) attended.
      3. 'attendanceCount': Number of unique rounds.
      4. CATEGORIES:
         - 'placementTargets': Count >= 4 AND NO "[배치완료]" in any notes.
         - 'placedMembers': Count >= 4 AND HAS "[배치완료]" in any notes.
         - 'completedMembers': Count >= 8.
         - 'ongoingMembers': Count < 4 AND NO "[배치완료]".
      
      Data: ${rawData}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          placementTargets: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING }, lastAuthor: { type: Type.STRING, nullable: true } } } },
          placedMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING }, lastAuthor: { type: Type.STRING, nullable: true } } } },
          ongoingMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING }, lastAuthor: { type: Type.STRING, nullable: true } } } },
          completedMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING }, lastAuthor: { type: Type.STRING, nullable: true } } } },
          totalAttendanceRecords: { type: Type.NUMBER }
        },
        required: ["placementTargets", "placedMembers", "ongoingMembers", "completedMembers", "totalAttendanceRecords"]
      }
    }
  });
  return JSON.parse(response.text.trim()) as AnalysisResult;
};

const fetchSheetCSV = async (url: string) => {
  const mid = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!mid) throw new Error("Invalid Sheet URL");
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${mid[1]}/export?format=csv&cachebust=${Date.now()}`);
  if (!res.ok) throw new Error("Public access denied");
  return res.text();
};

const sendToAppsScript = async (entries: any[], url: string) => {
  if (!url) throw new Error("Apps Script URL missing");
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(entries)
  });
};

// --- UI COMPONENTS ---

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
            <h4 className="text-lg font-black">{member.name}</h4>
            {member.spouseName && <span className="text-[10px] bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded border border-rose-100 font-bold">👫 {member.spouseName}</span>}
            <button onClick={() => onEdit(member)} className="text-gray-300 hover:text-purple-600"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg></button>
          </div>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block mt-1 ${theme.bg} ${theme.text}`}>{member.region || '미지정'}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${isPlaced ? 'bg-emerald-100 text-emerald-600' : 'bg-purple-100 text-purple-600'}`}>
            {isPlaced ? '배치완료' : `${member.attendanceCount}회 수강`}
          </span>
        </div>
      </div>
      <div className="flex space-x-1 mb-4">
        {[1,2,3,4,5,6,7,8].map(n => <div key={n} className={`w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold ${member.attendedRounds.includes(n) ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-300'}`}>{n}</div>)}
      </div>
      <div className="text-[11px] text-gray-500 italic mb-4 line-clamp-2 min-h-[2.5em] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: member.details }} />
      {canPlace ? (
        <button onClick={() => onPlace(member)} className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all">순 배치하기</button>
      ) : (
        <div className="w-full py-2.5 bg-gray-50 text-gray-300 text-center rounded-xl text-xs font-bold border border-gray-100">
          {isPlaced ? '배치 완료됨' : '4회 수강 시 배치'}
        </div>
      )}
    </div>
  );
};

// --- APP MAIN ---

const App = () => {
  const [activeTab, setActiveTab] = useState<TabType>(TabType.IMPORT);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncTime, setSyncTime] = useState('-');
  const [scriptUrl, setScriptUrl] = useState(() => localStorage.getItem(APPS_SCRIPT_URL_KEY) || '');
  
  const [form, setForm] = useState<FormEntry>(() => {
    const d = localStorage.getItem(FORM_DRAFT_KEY);
    return d ? JSON.parse(d) : { author: localStorage.getItem(LAST_AUTHOR_KEY) || '', name: '', spouseName: '', date: new Date().toISOString().split('T')[0], classType: '2부 A반', round: '1', residence: '', preference: '', notes: '' };
  });

  const [editing, setEditing] = useState<Member | null>(null);
  const [placing, setPlacing] = useState<Member | null>(null);
  const [groupName, setGroupName] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(() => sessionStorage.getItem('admin_auth') === 'true');

  const sheetUrl = "https://docs.google.com/spreadsheets/d/1jbeyGUv0Xtvzf1HGLyb-loZY8BzVdUxA5vupH1UK0E/edit?usp=sharing";

  useEffect(() => { localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(form)); }, [form]);
  useEffect(() => { doSync(); }, []);

  const doSync = async () => {
    setIsSyncing(true);
    try {
      const csv = await fetchSheetCSV(sheetUrl);
      const data = await analyzeSheetData(csv);
      setResult(data);
      setSyncTime(new Date().toLocaleTimeString());
    } catch (e) {
      console.error(e);
      alert("데이터 동기화 실패. 시트 공개 설정을 확인하세요.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSave = async (entry: FormEntry = form) => {
    if (!entry.name.trim() || !entry.author.trim()) return alert("이름과 작성자 성함을 입력하세요.");
    setIsSaving(true);
    try {
      await sendToAppsScript([entry], scriptUrl);
      localStorage.setItem(LAST_AUTHOR_KEY, entry.author);
      if (entry === form) setForm({ ...form, name: '', spouseName: '', residence: '', notes: '' });
      setEditing(null);
      setPlacing(null);
      setTimeout(doSync, 2000);
    } catch (e: any) {
      alert("저장 실패: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const NavItem = ({ id, label, icon }: any) => (
    <button onClick={() => setActiveTab(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeTab === id ? 'bg-purple-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
      <span>{icon}</span><span className="font-bold text-sm">{label}</span>
    </button>
  );

  const Section = ({ title, members, icon }: any) => (
    <div className="mb-10">
      <div className="flex items-center space-x-2 mb-6 border-b pb-2"><span className="text-xl">{icon}</span><h3 className="text-lg font-black">{title} ({members.length})</h3></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((m: any, i: number) => <MemberCard key={i} member={m} onEdit={setEditing} onPlace={setPlacing} />)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <nav className="w-64 bg-white border-r p-6 flex flex-col fixed h-full z-40 hidden md:flex">
        <div className="mb-8 flex items-center space-x-2"><div className="w-10 h-8 bg-purple-600 rounded flex items-center justify-center text-white font-black text-xs">1516</div><h1 className="font-bold">새가족 비서</h1></div>
        <div className="space-y-1 flex-1">
          <NavItem id={TabType.IMPORT} label="출석 입력" icon="📥" />
          <NavItem id={TabType.DASHBOARD} label="현황 요약" icon="📊" />
          <NavItem id={TabType.TARGETS} label="배치 대상" icon="✨" />
          <NavItem id={TabType.PLACED} label="배치 완료" icon="✅" />
        </div>
        <button onClick={() => setActiveTab(TabType.ADMIN)} className="text-[10px] text-gray-400 hover:text-purple-600 font-bold">⚙️ 관리자 설정</button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-6 md:p-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-black capitalize">{activeTab}</h2>
            <div className="flex items-center space-x-3 text-[11px] font-bold text-gray-400 bg-white px-4 py-2 rounded-full border">
              <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
              <span>최근 동기화: {syncTime}</span>
              <button onClick={doSync} className="hover:text-purple-600">새로고침</button>
            </div>
          </div>

          {activeTab === TabType.IMPORT && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
              <div className="lg:col-span-7 bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                <div className="flex justify-between items-end border-b pb-4">
                  <h3 className="font-black text-lg">정보 입력</h3>
                  <div className="text-right"><p className="text-[10px] text-gray-400 font-bold mb-1">작성 비서</p><input type="text" value={form.author} onChange={e => setForm({...form, author: e.target.value})} className="p-2 border rounded-lg text-xs font-black w-24 text-center bg-purple-50 outline-none" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">성함</p><input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" placeholder="성함" /></div>
                  <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">배우자</p><input type="text" value={form.spouseName} onChange={e => setForm({...form, spouseName: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-xl outline-none" placeholder="배우자" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">날짜</p><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full p-3 bg-gray-50 border rounded-xl outline-none" /></div>
                  <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">수강 회차 (1~8)</p>
                    <div className="flex flex-wrap gap-1">
                      {[1,2,3,4,5,6,7,8].map(n => <button key={n} onClick={() => setForm({...form, round: n.toString()})} className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${form.round === n.toString() ? 'bg-purple-600 text-white' : 'bg-white text-gray-400'}`}>{n}</button>)}
                    </div>
                  </div>
                </div>
                <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">거주 지역</p>
                  <div className="flex flex-wrap gap-1.5">{["정자동","금곡동","구미동","동원동","궁내동"].map(z => <button key={z} onClick={() => setForm({...form, residence: z})} className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border ${form.residence === z ? 'bg-purple-600 text-white' : 'bg-white text-gray-400'}`}>{z}</button>)}</div>
                </div>
                <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">특이사항</p><RichTextEditor value={form.notes} onChange={v => setForm({...form, notes: v})} placeholder="교육 내용, 가족 관계 등..." /></div>
                <button disabled={isSaving} onClick={() => handleSave()} className={`w-full py-4 text-white font-black rounded-2xl shadow-xl transition-all ${isSaving ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700'}`}>{isSaving ? "전송 중..." : "명단 추가"}</button>
              </div>
              <div className="lg:col-span-5 bg-white p-8 rounded-3xl border h-[680px] flex flex-col shadow-sm">
                <h3 className="font-bold mb-4">입력 히스토리</h3>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                  {result && result.totalAttendanceRecords > 0 ? (
                    <div className="text-center py-10 opacity-30"><p className="text-sm font-bold">최근 데이터는 시트에서 확인하세요</p></div>
                  ) : <p className="text-center text-gray-300 py-10">데이터 로딩 중...</p>}
                </div>
              </div>
            </div>
          )}

          {result && activeTab === TabType.DASHBOARD && (
            <div className="space-y-10 animate-in fade-in duration-700">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-purple-600 p-6 rounded-3xl text-white shadow-xl shadow-purple-100"><p className="text-xs font-bold opacity-70 mb-1">배치 대기</p><p className="text-3xl font-black">{result.placementTargets.length}명</p></div>
                <div className="bg-white p-6 rounded-3xl border shadow-sm"><p className="text-xs font-bold text-gray-400 mb-1">배치 완료</p><p className="text-3xl font-black">{result.placedMembers.length}명</p></div>
                <div className="bg-white p-6 rounded-3xl border shadow-sm"><p className="text-xs font-bold text-gray-400 mb-1">교육 중</p><p className="text-3xl font-black">{result.ongoingMembers.length}명</p></div>
                <div className="bg-white p-6 rounded-3xl border shadow-sm"><p className="text-xs font-bold text-gray-400 mb-1">총 기록수</p><p className="text-3xl font-black">{result.totalAttendanceRecords}</p></div>
              </div>
              <Section title="지금 배치 가능한 성도" members={result.placementTargets} icon="✨" />
            </div>
          )}

          {result && activeTab === TabType.TARGETS && <Section title="배치 대기 명단" members={result.placementTargets} icon="✨" />}
          {result && activeTab === TabType.PLACED && <Section title="배치 완료 명단" members={result.placedMembers} icon="✅" />}
          {result && activeTab === TabType.ONGOING && <Section title="교육 진행 명단" members={result.ongoingMembers} icon="🌱" />}

          {activeTab === TabType.ADMIN && (
            <div className="bg-white p-10 rounded-3xl border shadow-sm max-w-2xl mx-auto space-y-8">
              <h2 className="text-xl font-bold">관리자 설정</h2>
              {!isAuthorized ? (
                <div className="flex space-x-2"><input type="password" id="pw" className="flex-1 p-3 border rounded-xl outline-none" placeholder="비번" /><button onClick={() => { if((document.getElementById('pw') as any).value === '1516') { setIsAuthorized(true); sessionStorage.setItem('admin_auth', 'true'); } }} className="px-6 bg-gray-900 text-white font-bold rounded-xl">인증</button></div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-gray-500">Apps Script Web App URL (Post)</p>
                  <input type="text" value={scriptUrl} onChange={e => { setScriptUrl(e.target.value); localStorage.setItem(APPS_SCRIPT_URL_KEY, e.target.value); }} className="w-full p-4 border rounded-2xl text-[10px] outline-none focus:ring-2 focus:ring-purple-500" placeholder="https://..." />
                  <p className="text-[10px] text-gray-400">※ 입력한 URL은 브라우저에 저장되어 매번 입력할 필요가 없습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {editing && (
        <div className="fixed inset-0 z-[999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 bg-purple-600 text-white flex justify-between items-center"><h3 className="font-bold">{editing.name}님 정보 수정</h3><button onClick={() => setEditing(null)} className="text-2xl">&times;</button></div>
            <div className="p-8 space-y-6">
              <input type="text" value={editing.spouseName} onChange={e => setEditing({...editing, spouseName: e.target.value})} className="w-full p-3 border rounded-xl" placeholder="배우자" />
              <RichTextEditor value={editing.details} onChange={v => setEditing({...editing, details: v})} placeholder="노트 수정..." />
              <button disabled={isSaving} onClick={() => handleSave({ author: form.author, name: editing.name, spouseName: editing.spouseName || '', date: new Date().toISOString().split('T')[0], classType: '정보수정', round: '0', residence: editing.region, preference: '', notes: editing.details })} className="w-full py-4 bg-purple-600 text-white font-bold rounded-2xl">{isSaving ? '저장 중...' : '정보 업데이트'}</button>
            </div>
          </div>
        </div>
      )}

      {placing && (
        <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
            <div className={`p-6 ${getTheme(placing.region).accent} text-white text-center`}><h3 className="text-xl font-black">{placing.name}님 순 배치</h3></div>
            <div className="p-8 space-y-6">
              <input autoFocus type="text" value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full p-5 bg-gray-50 border-2 rounded-2xl outline-none text-center text-lg font-black focus:border-purple-500" placeholder="배치할 순 이름 (예: 정자 1순)" onKeyPress={e => e.key === 'Enter' && handleSave({ author: form.author, name: placing.name, spouseName: placing.spouseName || '', date: new Date().toISOString().split('T')[0], classType: '순배치', round: '0', residence: placing.region, preference: '', notes: `[배치완료: ${groupName}] ${placing.details}` })} />
              <div className="flex space-x-3"><button onClick={() => setPlacing(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl">취소</button><button disabled={isSaving || !groupName.trim()} onClick={() => handleSave({ author: form.author, name: placing.name, spouseName: placing.spouseName || '', date: new Date().toISOString().split('T')[0], classType: '순배치', round: '0', residence: placing.region, preference: '', notes: `[배치완료: ${groupName}] ${placing.details}` })} className={`flex-[2] py-4 ${getTheme(placing.region).accent} text-white font-black rounded-2xl`}>{isSaving ? "배치 중..." : "확정"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = document.getElementById('root');
if (root) ReactDOM.createRoot(root).render(<App />);

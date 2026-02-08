
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- CONSTANTS ---
const FORM_DRAFT_KEY = 'member_form_draft';
const LAST_AUTHOR_KEY = 'last_author';
const APPS_SCRIPT_URL_KEY = 'apps_script_url';

// --- TYPES & INTERFACES ---
export interface Member {
  name: string;
  spouseName?: string;
  attendanceCount: number;
  attendedRounds: number[];
  region: string;
  details: string; 
  status: 'TARGET' | 'ONGOING' | 'COMPLETED';
  isPlaced?: boolean;
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
  author: string;    // 구글 시트 J열 매핑용
  name: string;      // A열
  spouseName: string;// B열
  date: string;      // C열
  classType: string; // D열
  round: string;     // E열
  residence: string; // F열
  preference: string;// G열
  notes: string;     // H열
  timestamp?: string; 
}

// --- RICH TEXT EDITOR COMPONENT ---
const RichTextEditor: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50 focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent transition-all">
      <div className="flex items-center space-x-1 p-2 bg-gray-100/50 border-b border-gray-100">
        <button type="button" onClick={() => execCommand('bold')} className="p-1.5 hover:bg-white rounded transition-colors text-gray-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"></path></svg></button>
        <button type="button" onClick={() => execCommand('italic')} className="p-1.5 hover:bg-white rounded transition-colors text-gray-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg></button>
        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <button type="button" onClick={() => execCommand('insertUnorderedList')} className="p-1.5 hover:bg-white rounded transition-colors text-gray-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
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

// --- SERVICES ---

const fetchSheetData = async (sheetUrl: string): Promise<string> => {
  try {
    const matches = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!matches || !matches[1]) throw new Error("유효한 구글 시트 URL이 아닙니다.");
    const exportUrl = `https://docs.google.com/spreadsheets/d/${matches[1]}/export?format=csv&cachebust=${Date.now()}`;
    const response = await fetch(exportUrl);
    if (!response.ok) throw new Error("시트 공개 설정을 확인해주세요.");
    return await response.text();
  } catch (error) {
    console.error("Sheet Fetch Error:", error);
    throw error;
  }
};

const appendEntriesToSheet = async (entries: any[], scriptUrl: string): Promise<void> => {
  if (!scriptUrl) throw new Error("Apps Script URL이 설정되지 않았습니다.");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    // text/plain content type to avoid CORS preflight issues
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors', 
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(entries), // author 필드 포함됨
      signal: controller.signal
    });
    clearTimeout(timeoutId);
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw new Error("저장 중 오류 발생: " + error.message);
  }
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analyzeSheetData = async (rawData: string): Promise<AnalysisResult> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze church CSV data. Summarize by unique names. CATEGORIZATION: TARGET(4+ rounds, no [배치완료]), placed(4+ rounds, has [배치완료]), ONGOING(<4 rounds, no [배치완료]), COMPLETED(8+ rounds). Extract author from column J if exists. CSV: ${rawData}`,
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

// --- COMPONENTS ---

const parseDetail = (details: string, label: string) => {
  const regex = new RegExp(`${label}:\\s*([^,]+)(?:,|$)`);
  const match = details.match(regex);
  return match ? match[1].trim() : '';
};

const getPlacedGroup = (details: string) => {
  const match = details.match(/\[배치완료:\s*([^\]]+)\]/);
  return match ? match[1] : null;
};

const getZoneTheme = (region: string) => {
  if (region.includes('알파')) return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', accent: 'bg-indigo-600', hover: 'hover:bg-indigo-700', shadow: 'shadow-indigo-100' };
  if (region.includes('시에라')) return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', accent: 'bg-emerald-600', hover: 'hover:bg-emerald-700', shadow: 'shadow-emerald-100' };
  return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', accent: 'bg-slate-600', hover: 'hover:bg-slate-700', shadow: 'shadow-slate-100' };
};

const RoundSelector: React.FC<{ selected: string, attended: number[], onSelect: (r: string) => void }> = ({ selected, attended, onSelect }) => (
  <div className="flex flex-wrap gap-1.5">
    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => {
      const isAttended = attended.includes(n);
      const isSelected = selected === n.toString();
      return (
        <button key={n} type="button" onClick={() => onSelect(n.toString())} className={`w-9 h-9 rounded-lg font-bold transition-all border-2 flex items-center justify-center relative text-sm ${isSelected ? 'bg-purple-600 border-purple-600 text-white shadow-md' : isAttended ? 'bg-purple-50 border-purple-200 text-purple-400' : 'bg-white border-gray-100 text-gray-400'}`}>
          {n}{isAttended && !isSelected && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-purple-500 text-white rounded-full flex items-center justify-center text-[7px] border border-white">✓</span>}
        </button>
      );
    })}
  </div>
);

const AttendanceDots: React.FC<{ attended: number[] }> = ({ attended }) => (
  <div className="flex space-x-1 mt-2">
    {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
      <div key={num} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${attended.includes(num) ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-300'}`}>{num}</div>
    ))}
  </div>
);

const MemberCard: React.FC<{ member: Member, onEdit: (m: Member) => void, onOpenPlacement: (m: Member) => void }> = ({ member, onEdit, onOpenPlacement }) => {
  const placedGroup = getPlacedGroup(member.details);
  const theme = getZoneTheme(member.region);
  const isPlaced = !!placedGroup;
  const isTarget = member.status === 'TARGET';
  const shouldShowPlacementButton = !isPlaced && member.attendanceCount >= 4;

  const statusConfig: any = {
    TARGET: { bg: isPlaced ? 'bg-emerald-600' : theme.accent, text: 'text-white', label: isPlaced ? '배치 완료' : '배치 대상' },
    COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', label: '교육 수료' },
    ONGOING: { bg: 'bg-amber-100', text: 'text-amber-700', label: '진행 중' }
  };
  // '기타' 라벨 삭제 - 상태가 명확하지 않으면 표시하지 않음
  const config = statusConfig[member.status] || null;

  return (
    <div className={`flex flex-col rounded-2xl border transition-all duration-300 overflow-hidden bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 ${isTarget && !isPlaced ? `border-2 ${theme.border} ring-4 ring-offset-2 ${theme.bg.replace('bg-', 'ring-')}/10` : 'border-gray-100'}`}>
      <div className="p-5 flex-1">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <h4 className="text-xl font-black text-gray-900">{member.name}</h4>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-black rounded-md border border-purple-100">{member.attendanceCount}회 누적</span>
              {member.spouseName && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-black rounded-md border border-rose-100">👫 {member.spouseName}</span>}
              <button type="button" onClick={() => onEdit(member)} className="p-1 text-gray-300 hover:text-purple-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </button>
            </div>
            <p className={`text-[10px] font-black mt-1 px-2 py-0.5 rounded-full inline-block ${theme.bg} ${theme.text} border ${theme.border}`}>
              {member.region || '미지정'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
             {config && (
               <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm ${config.bg} ${config.text}`}>
                 {config.label}
               </span>
             )}
             {shouldShowPlacementButton && (
               <div className="flex items-center space-x-1 animate-pulse">
                 <span className="w-2 h-2 rounded-full bg-red-500"></span>
                 <span className="text-[9px] font-black text-red-500 uppercase">Ready</span>
               </div>
             )}
          </div>
        </div>

        <AttendanceDots attended={member.attendedRounds} />
        
        <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100/50 text-[12px] text-gray-600 leading-relaxed italic min-h-[60px] flex items-center prose prose-sm max-w-none">
          {member.details ? <div dangerouslySetInnerHTML={{ __html: member.details }} /> : <span>기록 없음</span>}
        </div>

        {member.lastAuthor && (
          <div className="mt-2 flex items-center space-x-1 text-[9px] font-bold text-gray-400">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path></svg>
            <span>작성자: {member.lastAuthor}</span>
          </div>
        )}
      </div>

      <div className="px-5 pb-5 pt-1">
        {isPlaced ? (
          <div className="w-full py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center justify-center space-x-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"></path></svg>
            <span className="text-[12px] font-black">{placedGroup}</span>
          </div>
        ) : shouldShowPlacementButton ? (
          <button type="button" onClick={() => onOpenPlacement(member)} className={`w-full py-3.5 ${theme.accent} text-white text-[13px] font-black rounded-xl ${theme.hover} transition-all shadow-lg ${theme.shadow} flex items-center justify-center space-x-2`}>
            <span>순 배치하기</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
          </button>
        ) : (
          <div className="w-full py-3 bg-gray-50 border border-gray-100 text-gray-400 text-center rounded-xl text-[12px] font-bold">교육 중 (4회 시 배치 가능)</div>
        )}
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ title: string, count: number, icon: string, colorClass: string }> = ({ title, count, icon, colorClass }) => (
  <div className={`flex items-center justify-between mb-4 mt-8 first:mt-0 pb-2 border-b-2 ${colorClass}`}>
    <div className="flex items-center space-x-2"><span className="text-xl">{icon}</span><h3 className="text-lg font-black">{title}</h3></div>
    <span className="text-xs font-bold px-3 py-1 bg-white rounded-full border shadow-sm">{count}명</span>
  </div>
);

// --- MAIN APP ---

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>(TabType.IMPORT);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [recentLogs, setRecentLogs] = useState<FormEntry[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => localStorage.getItem('last_sync_time') || '-');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'success' | 'error' | 'idle'>('idle');

  const [currentEntry, setCurrentEntry] = useState<FormEntry>(() => {
    const saved = localStorage.getItem(FORM_DRAFT_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { author: localStorage.getItem(LAST_AUTHOR_KEY) || '', name: '', spouseName: '', date: new Date().toISOString().split('T')[0], classType: '2부 A반', round: '1', residence: '', preference: '', notes: '' };
  });

  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [placingMember, setPlacingMember] = useState<Member | null>(null);
  const [smallGroupName, setSmallGroupName] = useState('');
  const [editForm, setEditForm] = useState<FormEntry>({ author: '', name: '', spouseName: '', date: '', classType: '', round: '', residence: '', preference: '', notes: '' });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [scriptUrl, setScriptUrl] = useState<string>(() => localStorage.getItem(APPS_SCRIPT_URL_KEY) || '');
  const [isAuthorized, setIsAuthorized] = useState(() => sessionStorage.getItem('admin_authorized') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const sheetUrl = "https://docs.google.com/spreadsheets/d/1jbeyGUv0Xtvzf1HGLybj-loZY8BzVdUxA5vupH1UK0E/edit?usp=sharing";

  useEffect(() => { localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(currentEntry)); }, [currentEntry]);
  useEffect(() => { handleSyncFromSheet(); }, []);
  
  // Apps Script URL이 변경될 때마다 즉시 보존
  useEffect(() => { 
    if (scriptUrl) localStorage.setItem(APPS_SCRIPT_URL_KEY, scriptUrl); 
  }, [scriptUrl]);

  const handleSyncFromSheet = async (customCsv?: string, silent = false) => {
    if (!silent) setIsAnalyzing(true);
    setIsSyncing(true);
    try {
      const csv = customCsv || await fetchSheetData(sheetUrl);
      const data = await analyzeSheetData(csv);
      setResult(data);
      const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });
      setLastSyncTime(now);
      setSyncStatus('success');
      localStorage.setItem('last_sync_time', now);
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
    } finally {
      setIsAnalyzing(false);
      setIsSyncing(false);
    }
  };

  const handleAddEntry = async (entry: FormEntry = currentEntry) => {
    if (!entry.name.trim()) return alert("성함 입력은 필수입니다.");
    if (!entry.author.trim()) return alert("작성자(비서) 성함 입력은 필수입니다.");
    if (isSaving) return;

    setEditingMember(null);
    setPlacingMember(null);
    localStorage.setItem(LAST_AUTHOR_KEY, entry.author);
    setIsSaving(true);
    
    try {
      const entryWithTime = { ...entry, timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }) };
      // J열에 author 필드가 들어가도록 JSON 객체 그대로 전송
      await appendEntriesToSheet([entryWithTime], scriptUrl);
      setRecentLogs(prev => [entryWithTime, ...prev.slice(0, 9)]);
      
      if (entry === currentEntry) {
        setCurrentEntry(prev => ({ ...prev, name: '', spouseName: '', residence: '', preference: '', notes: '' }));
        localStorage.removeItem(FORM_DRAFT_KEY);
      }
      setSmallGroupName('');
      setTimeout(() => { handleSyncFromSheet(undefined, true); }, 2500);
    } catch (err: any) {
      alert("⚠️ 저장 실패: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmPlacement = () => {
    if (!placingMember || !smallGroupName.trim()) return alert("순 이름을 입력하세요.");
    const entryToSubmit: FormEntry = {
      author: currentEntry.author || '시스템',
      name: placingMember.name, 
      spouseName: placingMember.spouseName || '', 
      date: new Date().toISOString().split('T')[0],
      classType: '순배치', 
      round: '0', 
      residence: placingMember.region, 
      preference: parseDetail(placingMember.details, '선호'),
      notes: `[배치완료: ${smallGroupName}] ${parseDetail(placingMember.details, '가족/기타')}`
    };
    handleAddEntry(entryToSubmit);
  };

  const GroupedMemberGrid = ({ members }: { members: Member[] }) => {
    let filtered = members;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m => m.name.toLowerCase().includes(term) || (m.spouseName && m.spouseName.toLowerCase().includes(term)) || m.region.toLowerCase().includes(term));
    }
    const alpha = filtered.filter(m => m.region.includes('알파'));
    const sierra = filtered.filter(m => m.region.includes('시에라'));
    const other = filtered.filter(m => !m.region.includes('알파') && !m.region.includes('시에라'));
    
    return (
      <div className="space-y-12 animate-in fade-in duration-700">
        {alpha.length > 0 && <div><SectionHeader title="알파 지부" count={alpha.length} icon="🟣" colorClass="border-indigo-100 text-indigo-700" /><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{alpha.map((m, i) => <MemberCard key={i} member={m} onEdit={(m) => { setEditingMember(m); setEditForm({ ...editForm, name: m.name, spouseName: m.spouseName || '', notes: parseDetail(m.details, '가족/기타'), preference: parseDetail(m.details, '선호'), residence: m.region, classType: parseDetail(m.details, '예배'), author: currentEntry.author }); }} onOpenPlacement={setPlacingMember} />)}</div></div>}
        {sierra.length > 0 && <div><SectionHeader title="시에라 지부" count={sierra.length} icon="🟢" colorClass="border-emerald-100 text-emerald-700" /><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{sierra.map((m, i) => <MemberCard key={i} member={m} onEdit={(m) => { setEditingMember(m); setEditForm({ ...editForm, name: m.name, spouseName: m.spouseName || '', notes: parseDetail(m.details, '가족/기타'), preference: parseDetail(m.details, '선호'), residence: m.region, classType: parseDetail(m.details, '예배'), author: currentEntry.author }); }} onOpenPlacement={setPlacingMember} />)}</div></div>}
        {other.length > 0 && <div><SectionHeader title="기타 지부" count={other.length} icon="⚪" colorClass="border-slate-100 text-slate-700" /><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{other.map((m, i) => <MemberCard key={i} member={m} onEdit={(m) => { setEditingMember(m); setEditForm({ ...editForm, name: m.name, spouseName: m.spouseName || '', notes: parseDetail(m.details, '가족/기타'), preference: parseDetail(m.details, '선호'), residence: m.region, classType: parseDetail(m.details, '예배'), author: currentEntry.author }); }} onOpenPlacement={setPlacingMember} />)}</div></div>}
      </div>
    );
  };

  const NavContent = () => (
    <>
      <div className="mb-10 flex items-center space-x-3"><div className="w-12 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg text-[10px] font-black uppercase tracking-tighter">1516</div><h1 className="text-lg font-bold text-gray-900 leading-tight">1516 새가족 관리<br/><span className="text-purple-600 text-xs font-black">AI 데이터 비서</span></h1></div>
      
      {/* 실시간 시트 연동 현황판 */}
      <div className={`mb-8 p-4 rounded-2xl border transition-all ${syncStatus === 'error' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">실시간 연동 상태</span>
          <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : syncStatus === 'error' ? 'bg-red-500' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'}`}></div>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[11px] text-gray-500 font-bold">최근 동기화</p>
            <p className={`text-lg font-black tracking-tight ${syncStatus === 'error' ? 'text-red-600' : 'text-gray-800'}`}>{lastSyncTime}</p>
          </div>
          <button onClick={() => handleSyncFromSheet()} className="p-2 hover:bg-white rounded-lg transition-all text-purple-600 hover:shadow-sm">
            <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
        </div>
        {syncStatus === 'error' && <p className="text-[9px] font-bold text-red-500 mt-2">시트 데이터 수신 오류. 설정을 확인하세요.</p>}
      </div>

      <div className="space-y-1 flex-1">
        {[{ id: TabType.IMPORT, label: '출석 입력', icon: '📥' }, { id: TabType.DASHBOARD, label: '통계 현황', icon: '📊' }, { id: TabType.TARGETS, label: '배치 대상자', icon: '✨' }, { id: TabType.PLACED, label: '배치 완료자', icon: '✅' }, { id: TabType.ONGOING, label: '교육 중', icon: '🌱' }, { id: TabType.COMPLETED, label: '수료 완료', icon: '🎓' }].map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id as TabType); setIsMenuOpen(false); setSearchTerm(''); }} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all ${activeTab === tab.id ? 'bg-purple-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
            <div className="flex items-center space-x-3"><span className="text-base">{tab.icon}</span><span className="font-bold text-sm">{tab.label}</span></div>
          </button>
        ))}
      </div>
      <button onClick={() => setActiveTab(TabType.ADMIN)} className="mt-8 w-full text-[10px] font-bold text-gray-400 hover:text-gray-600 text-center py-2">⚙️ 관리자 설정 (URL 보존됨)</button>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900">
      <nav className="hidden md:flex w-72 bg-white border-r p-8 flex-col fixed h-full z-40"><NavContent /></nav>
      <header className="md:hidden bg-white border-b px-6 py-4 flex justify-between items-center fixed top-0 w-full z-40"><div className="flex items-center space-x-2"><div className="px-2 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white text-[10px] font-black">1516</div><h1 className="text-sm font-bold uppercase">{activeTab}</h1></div><button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-purple-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg></button></header>
      
      <main className="flex-1 p-6 md:p-10 md:ml-72 pt-24 md:pt-10 max-w-5xl mx-auto">
        {isAnalyzing && <div className="fixed inset-0 bg-white/60 backdrop-blur-[2px] z-[999] flex flex-col items-center justify-center"><div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div><p className="font-black text-purple-900">실시간 데이터 분석 중...</p></div>}
        
        {activeTab === TabType.IMPORT && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
            <div className="lg:col-span-7 bg-white rounded-3xl shadow-sm border p-8 space-y-6">
              <div className="flex justify-between items-center border-b pb-4">
                <h3 className="text-xl font-bold text-slate-800">새가족 정보 입력</h3>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-purple-500 tracking-widest mb-1">작성자(비서)</span>
                  <input type="text" value={currentEntry.author} onChange={e => setCurrentEntry({...currentEntry, author: e.target.value})} className="p-3 border rounded-xl text-sm font-black w-32 text-center bg-purple-50 border-purple-100 text-purple-700 outline-none focus:ring-2 focus:ring-purple-400 transition-all" placeholder="성함" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">이름</p><input type="text" value={currentEntry.name} onChange={e => setCurrentEntry({...currentEntry, name: e.target.value})} className="w-full p-4 bg-gray-50 border rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" placeholder="성함" /></div>
                <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">배우자</p><input type="text" value={currentEntry.spouseName} onChange={e => setCurrentEntry({...currentEntry, spouseName: e.target.value})} className="w-full p-4 bg-gray-50 border rounded-2xl outline-none" placeholder="배우자" /></div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1">출석 날짜</p><input type="date" value={currentEntry.date} onChange={e => setCurrentEntry({...currentEntry, date: e.target.value})} className="w-full p-4 bg-gray-50 border rounded-2xl outline-none" /></div>
                <div className="space-y-1"><p className="text-[10px] font-bold text-gray-400 ml-1 uppercase">수강 회차</p><RoundSelector selected={currentEntry.round} attended={[]} onSelect={(r) => setCurrentEntry({...currentEntry, round: r})} /></div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 ml-1">거주 지역</p>
                <div className="flex flex-wrap gap-1.5">
                  {["정자동", "금곡동", "구미동", "분당동", "수내동", "서현동", "판교동", "대장동"].map(z => <button key={z} onClick={() => setCurrentEntry({...currentEntry, residence: z})} className={`px-3 py-2 text-[11px] font-bold rounded-lg border transition-all ${currentEntry.residence === z ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-purple-300'}`}>{z}</button>)}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 ml-1">특이사항 (서식 지원)</p>
                <RichTextEditor value={currentEntry.notes} onChange={(val) => setCurrentEntry({...currentEntry, notes: val})} placeholder="노트 입력..." />
              </div>

              <div className="pt-2">
                <button disabled={isSaving} onClick={() => handleAddEntry()} className={`w-full py-5 text-white font-black rounded-2xl shadow-xl transition-all ${isSaving ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700'}`}>
                  {isSaving ? "데이터 전송 중..." : "명단 추가하기"}
                </button>
              </div>
            </div>
            
            <div className="lg:col-span-5 bg-white rounded-3xl p-8 border h-[720px] flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">최근 입력 로그 (Local)</h3>
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-tighter shadow-sm">J열 연동 중</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {recentLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20"><span className="text-4xl mb-4">📥</span><p className="font-black text-sm">입력된 기록이 없습니다</p></div>
                ) : (
                  recentLogs.map((log, i) => (
                    <div key={i} className="p-4 rounded-xl border bg-gray-50 text-sm relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <div className="flex justify-between font-black items-start">
                        <div>
                          <span className="text-gray-900">{log.name}</span>
                          <span className="text-[10px] text-purple-600 ml-2">비서: {log.author}</span>
                        </div>
                        <span className="text-[9px] text-gray-400 font-bold">{log.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">{log.residence} | {log.round}회차 | {log.classType}</p>
                      {log.notes && <div className="mt-2 text-[10px] text-gray-400 truncate opacity-60 prose prose-xs" dangerouslySetInnerHTML={{ __html: log.notes }} />}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        
        {result && activeTab !== TabType.IMPORT && activeTab !== TabType.ADMIN && (
          <GroupedMemberGrid members={activeTab === TabType.DASHBOARD ? result.placementTargets : activeTab === TabType.TARGETS ? result.placementTargets : activeTab === TabType.PLACED ? result.placedMembers : activeTab === TabType.ONGOING ? result.ongoingMembers : result.completedMembers} />
        )}
        
        {activeTab === TabType.ADMIN && (
          <div className="bg-white rounded-3xl p-10 border shadow-sm space-y-8 animate-in zoom-in duration-300">
            <h2 className="text-2xl font-bold">관리자 설정</h2>
            {!isAuthorized ? (
              <div className="flex space-x-2"><input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="flex-1 p-4 bg-gray-50 rounded-2xl border outline-none" placeholder="비밀번호" /><button onClick={() => { if(passwordInput === '1516') { setIsAuthorized(true); sessionStorage.setItem('admin_authorized', 'true'); } else { alert('비밀번호가 올바르지 않습니다.'); } }} className="px-8 bg-gray-900 text-white font-bold rounded-2xl">인증</button></div>
            ) : (
              <div className="space-y-6">
                <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-sm font-bold text-emerald-800 mb-2">🔗 Apps Script Web App URL (브라우저 영구 보존)</p>
                  <input type="text" value={scriptUrl} onChange={e => setScriptUrl(e.target.value)} className="w-full p-4 border rounded-2xl text-xs outline-none focus:ring-2 focus:ring-emerald-500" placeholder="https://script.google.com/macros/s/.../exec" />
                  <p className="mt-3 text-[10px] text-emerald-600 font-black tracking-tight leading-relaxed">
                    ※ 입력된 URL은 브라우저를 닫아도 삭제되지 않습니다. <br/>
                    ※ 시트의 J열에 'author' 필드가 기록되도록 Apps Script 코드를 구성해 주세요.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      
      {/* 배치 확정 모달 */}
      {placingMember && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <div className={`p-6 ${getZoneTheme(placingMember.region).accent} text-white text-center`}><h3 className="text-2xl font-black">{placingMember.name}님 순 배치</h3></div>
            <div className="p-8 space-y-6">
              <input autoFocus type="text" value={smallGroupName} onChange={e => setSmallGroupName(e.target.value)} className="w-full p-5 bg-gray-50 border-2 rounded-2xl outline-none text-center text-lg font-black focus:border-purple-500" placeholder="배치할 순 이름 (예: 정자 1순)" onKeyPress={(e) => e.key === 'Enter' && handleConfirmPlacement()} />
              <div className="flex space-x-3"><button onClick={() => setPlacingMember(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl">취소</button><button disabled={isSaving || !smallGroupName.trim()} onClick={handleConfirmPlacement} className={`flex-[2] py-4 px-8 ${getZoneTheme(placingMember.region).accent} text-white font-black rounded-2xl`}>{isSaving ? "배치 중..." : "배치 확정"}</button></div>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editingMember && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-8 bg-purple-600 text-white flex justify-between items-center"><h3 className="text-xl font-bold">{editingMember.name}님 정보 수정</h3><button onClick={() => setEditingMember(null)} className="text-3xl">&times;</button></div>
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 ml-1">배우자</p>
                <input type="text" value={editForm.spouseName} onChange={e => setEditForm({...editForm, spouseName: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl border outline-none focus:ring-2 focus:ring-purple-400" placeholder="배우자" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 ml-1">특이사항 수정</p>
                <RichTextEditor value={editForm.notes} onChange={(val) => setEditForm({...editForm, notes: val})} placeholder="수정 사항..." />
              </div>
              <button disabled={isSaving} onClick={() => handleAddEntry({ ...editForm, author: currentEntry.author || '비서', classType: '정보수정', round: '0', date: new Date().toISOString().split('T')[0] })} className="w-full py-4 bg-purple-600 text-white font-bold rounded-2xl shadow-xl hover:bg-purple-700 transition-all">{isSaving ? "저장 중..." : "수정 내용 저장"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) ReactDOM.createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);

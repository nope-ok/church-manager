
import React, { useState, useMemo, useEffect } from 'react';
import { analyzeSheetData } from './services/geminiService';
import { fetchSheetData, appendEntriesToSheet } from './services/sheetService';
import { AnalysisResult, TabType, Member } from './types';

// Helper to parse details string
const parseDetail = (details: string, label: string) => {
  const regex = new RegExp(`${label}:\\s*([^,]+)(?:,|$)`);
  const match = details.match(regex);
  const result = match ? match[1].trim() : '';
  return result === '없음' ? '' : result;
};

// Helper to extract placed group name
const getPlacedGroup = (details: string) => {
  const match = details.match(/\[배치완료:\s*([^\]]+)\]/);
  return match ? match[1] : null;
};

// Helper to get zone theme
const getZoneTheme = (region: string) => {
  if (region.includes('알파')) return {
    id: 'ALPHA',
    name: '알파',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-600',
    accent: 'bg-indigo-600',
    hover: 'hover:bg-indigo-700',
    shadow: 'shadow-indigo-100/50'
  };
  if (region.includes('시에라')) return {
    id: 'SIERRA',
    name: '시에라',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-600',
    accent: 'bg-emerald-600',
    hover: 'hover:bg-emerald-700',
    shadow: 'shadow-emerald-100/50'
  };
  return {
    id: 'OTHER',
    name: '기타',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-600',
    accent: 'bg-slate-600',
    hover: 'hover:bg-slate-700',
    shadow: 'shadow-slate-100/50'
  };
};

// Interactive Round Selector Component
const RoundSelector: React.FC<{
  selected: string;
  attended: number[];
  onSelect: (round: string) => void;
}> = ({ selected, attended, onSelect }) => (
  <div className="flex flex-wrap gap-2">
    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => {
      const isAttended = attended.includes(n);
      const isSelected = selected === n.toString();
      return (
        <button
          key={n}
          type="button"
          onClick={() => onSelect(n.toString())}
          className={`w-10 h-10 rounded-xl font-bold transition-all border-2 flex items-center justify-center relative ${
            isSelected 
              ? 'bg-purple-600 border-purple-600 text-white shadow-md scale-110 z-10' 
              : isAttended
                ? 'bg-purple-50 border-purple-200 text-purple-400 hover:border-purple-400'
                : 'bg-white border-gray-100 text-gray-400 hover:border-purple-300'
          }`}
        >
          {n}
          {isAttended && !isSelected && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 text-white rounded-full flex items-center justify-center text-[8px] border border-white">
              ✓
            </span>
          )}
        </button>
      );
    })}
  </div>
);

// Attendance Progress Component (Simple view)
const AttendanceDots: React.FC<{ attended: number[] }> = ({ attended }) => {
  return (
    <div className="flex space-x-1 mt-2">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
        const isAttended = attended.includes(num);
        return (
          <div 
            key={num}
            title={`${num}주 ${isAttended ? '수강완료' : '미수강'}`}
            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition-all ${
              isAttended 
                ? 'bg-purple-600 text-white shadow-sm' 
                : 'bg-gray-100 text-gray-300'
            }`}
          >
            {num}
          </div>
        );
      })}
    </div>
  );
};

// Components
const StatCard: React.FC<{ title: string, count: number, color: string, onClick?: () => void }> = ({ title, count, color, onClick }) => (
  <button 
    onClick={onClick}
    className={`p-6 rounded-2xl shadow-sm border border-gray-100 ${color} flex flex-col items-center justify-center transition-all duration-500 hover:scale-[1.05] active:scale-95 group relative`}
  >
    <h3 className="opacity-80 text-sm font-medium mb-1 group-hover:scale-110 transition-transform">{title}</h3>
    <span className="text-3xl font-black">{count}</span>
    {onClick && <span className="absolute bottom-2 text-[8px] opacity-0 group-hover:opacity-60 transition-opacity">목록 보기 →</span>}
  </button>
);

const MemberCard: React.FC<{ 
  member: Member, 
  highlight?: boolean, 
  onEdit: (m: Member) => void,
  onOpenPlacement: (m: Member) => void 
}> = ({ member, highlight, onEdit, onOpenPlacement }) => {
  const placedGroup = getPlacedGroup(member.details);
  const isPlaced = !!placedGroup;
  const theme = getZoneTheme(member.region);
  
  const statusConfig = {
    TARGET: { 
      bg: isPlaced ? 'bg-emerald-600' : theme.accent, 
      text: 'text-white', 
      label: isPlaced ? '순 배치 완료' : '순 배치 대상' 
    },
    COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', label: '교육 수료' },
    ONGOING: { bg: 'bg-amber-100', text: 'text-amber-700', label: '진행 중' }
  };

  const config = statusConfig[member.status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: '기타' };
  const shouldShowPlacementButton = !isPlaced && member.attendanceCount >= 4;

  return (
    <div className={`p-5 rounded-xl border group transition-all duration-300 ${highlight ? `${theme.bg} ${theme.border} shadow-xl ${theme.shadow} scale-[1.02]` : 'bg-white border-gray-100 shadow-sm hover:shadow-md'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h4 className="text-lg font-bold text-gray-900">{member.name}</h4>
            {member.spouseName && (
              <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-black rounded-md flex items-center border border-rose-100">
                <span className="mr-1">👫</span>{member.spouseName}
              </span>
            )}
            {placedGroup && (
              <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-black rounded-md shadow-sm animate-pulse">
                📍 {placedGroup}
              </span>
            )}
            <button 
              type="button"
              onClick={() => onEdit(member)}
              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-purple-600 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
          </div>
          <p className={`text-[11px] font-bold mt-1 px-1.5 py-0.5 rounded inline-block ${theme.bg} ${theme.text}`}>
            {member.region || '미지정'}
          </p>
          <AttendanceDots attended={member.attendedRounds} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${config.bg} ${config.text} whitespace-nowrap shadow-sm`}>
            {member.attendanceCount}회 {config.label}
          </span>
          {shouldShowPlacementButton && (
            <button 
              type="button"
              onClick={() => onOpenPlacement(member)}
              className={`px-3 py-1.5 ${theme.accent} text-white text-[11px] font-black rounded-lg ${theme.hover} transition-all shadow-lg ${theme.shadow} active:scale-95`}
            >
              순 배치하기 →
            </button>
          )}
        </div>
      </div>
      <div className="bg-white/60 p-3 rounded-lg border border-gray-50 mt-2">
        <div className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap italic opacity-80">
          "{member.details}"
        </div>
      </div>
    </div>
  );
};

// Section Header Component
const SectionHeader: React.FC<{ title: string, count: number, icon: string, colorClass: string }> = ({ title, count, icon, colorClass }) => (
  <div className={`flex items-center justify-between mb-4 mt-8 first:mt-0 pb-2 border-b-2 ${colorClass}`}>
    <div className="flex items-center space-x-2">
      <span className="text-xl">{icon}</span>
      <h3 className="text-lg font-black">{title}</h3>
    </div>
    <span className="text-xs font-bold px-3 py-1 bg-white rounded-full border shadow-sm">{count}명 대기 중</span>
  </div>
);

interface FormEntry {
  name: string;
  spouseName: string;
  date: string;
  classType: string;
  round: string;
  residence: string;
  preference: string;
  notes: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>(TabType.IMPORT);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [rawCsvData, setRawCsvData] = useState<string>('');
  const [recentLogs, setRecentLogs] = useState<FormEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<FormEntry>({
    name: '', spouseName: '', date: new Date().toISOString().split('T')[0], classType: '2부 A반', round: '1', residence: '', preference: '', notes: ''
  });

  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [placingMember, setPlacingMember] = useState<Member | null>(null);
  const [smallGroupName, setSmallGroupName] = useState('');
  
  const [editForm, setEditForm] = useState<FormEntry>({
    name: '', spouseName: '', date: '', classType: '', round: '', residence: '', preference: '', notes: ''
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'none'>('none');

  const [scriptUrl, setScriptUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('apps_script_url') || '';
    } catch {
      return '';
    }
  });
  const [urlSaveStatus, setUrlSaveStatus] = useState(false);

  useEffect(() => {
    if (scriptUrl) {
      localStorage.setItem('apps_script_url', scriptUrl);
    }
  }, [scriptUrl]);

  const [isAuthorized, setIsAuthorized] = useState(() => {
    return sessionStorage.getItem('admin_authorized') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [adminPassword] = useState<string>(() => localStorage.getItem('admin_password') || 'churchpassword123');

  const sheetUrl = "https://docs.google.com/spreadsheets/d/1jbeyGUv0Xtvzf1HGLybj-loZY8BzVdUxA5vupH1UK0E/edit?usp=sharing";
  const prefOptions = ["부부순", "부부순 자녀와 같은 나이대", "자매순", "자매순-주말반"];
  const alphaZones = ["정자동", "금곡동", "궁내동", "구미동"];
  const sierraZones = ["분당동", "수내동", "서현동", "율동", "이매동", "야탑동", "판교동", "삼평동", "백현동", "운중동", "대장동", "석운동", "하산운동"];

  const menuItems = [
    { id: TabType.IMPORT, label: '출석 입력', icon: '📥' },
    { id: TabType.DASHBOARD, label: '통계 현황', icon: '📊' },
    { id: TabType.TARGETS, label: '배치 대상자', icon: '✨', badge: true },
    { id: TabType.PLACED, label: '배치 완료자', icon: '✅' },
    { id: TabType.ONGOING, label: '교육 중', icon: '🌱' },
    { id: TabType.COMPLETED, label: '수료 완료', icon: '🎓' },
  ];

  const handleSyncFromSheet = async (customCsv?: string, silent = false) => {
    if (!silent) setIsAnalyzing(true);
    try {
      let csvToAnalyze = customCsv;
      if (!csvToAnalyze) {
        csvToAnalyze = await fetchSheetData(sheetUrl);
        setRawCsvData(csvToAnalyze);
      }
      const data = await analyzeSheetData(csvToAnalyze);
      setResult(data);
      setConnectionStatus('connected');
    } catch (err: any) {
      console.error(err);
      setConnectionStatus('error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => { handleSyncFromSheet(); }, []);

  const existingMemberInfo = useMemo(() => {
    const map = new Map<string, Member>();
    if (result) {
      [...result.placementTargets, ...result.placedMembers, ...result.ongoingMembers, ...result.completedMembers].forEach(m => {
        map.set(m.name, m);
      });
    }
    return map;
  }, [result]);

  const currentMatch = useMemo(() => {
    if (!currentEntry.name.trim()) return null;
    return existingMemberInfo.get(currentEntry.name.trim());
  }, [currentEntry.name, existingMemberInfo]);

  const handleLoadExistingMember = (member: Member) => {
    const currentPref = parseDetail(member.details, '선호');
    const currentNotes = parseDetail(member.details, '가족/기타');
    
    let suggestedRound = 1;
    for (let i = 1; i <= 8; i++) {
      if (!member.attendedRounds.includes(i)) {
        suggestedRound = i;
        break;
      }
    }
    
    setCurrentEntry(prev => ({
      ...prev,
      spouseName: member.spouseName || parseDetail(member.details, '배우자') || '',
      residence: member.region,
      preference: currentPref,
      round: suggestedRound.toString(),
      notes: currentNotes
    }));
  };

  const handleAddEntry = async (entry: FormEntry = currentEntry) => {
    if (!entry.name.trim()) {
      alert("이름을 입력해주세요.");
      return;
    }

    if (!scriptUrl || !scriptUrl.startsWith('http')) {
      alert("관리자 설정에서 Apps Script URL을 먼저 올바르게 입력해주세요.");
      setActiveTab(TabType.ADMIN);
      return;
    }

    setIsSaving(true);
    try {
      await appendEntriesToSheet([entry], scriptUrl);
      
      setRecentLogs(prev => [entry, ...prev.slice(0, 9)]);
      
      if (entry === currentEntry) {
        setCurrentEntry({ ...currentEntry, name: '', spouseName: '', residence: '', preference: '', notes: '' });
      }
      setEditingMember(null);
      setPlacingMember(null);
      setSmallGroupName('');

      setTimeout(() => {
        handleSyncFromSheet(undefined, true);
        alert("기록이 시트에 저장되었습니다.");
      }, 2500);
    } catch (err: any) {
      console.error(err);
      alert("시트 저장 중 오류: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!scriptUrl) { alert("URL을 먼저 입력하세요."); return; }
    setIsSaving(true);
    try {
      await appendEntriesToSheet([{ name: '연동테스트', notes: '연동 테스트 데이터입니다.' }], scriptUrl);
      alert("연동 테스트 성공! 구글 시트 마지막 줄을 확인해보세요.");
    } catch (err: any) {
      alert("연동 테스트 실패: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmPlacement = () => {
    if (!placingMember) return;
    if (!smallGroupName.trim()) {
      alert("배치할 순 이름을 입력해주세요.");
      return;
    }

    const existingNotes = parseDetail(placingMember.details, '가족/기타');
    const newEntry: FormEntry = {
      name: placingMember.name,
      spouseName: placingMember.spouseName || '',
      date: new Date().toISOString().split('T')[0],
      classType: '순배치',
      round: '0', 
      residence: placingMember.region,
      preference: parseDetail(placingMember.details, '선호'),
      notes: `[배치완료: ${smallGroupName}] ${existingNotes}`
    };
    handleAddEntry(newEntry);
  };

  const handleEditClick = (member: Member) => {
    const currentPref = parseDetail(member.details, '선호');
    const currentNotes = parseDetail(member.details, '가족/기타');
    const currentSpouse = parseDetail(member.details, '배우자');
    setEditingMember(member);
    setEditForm({
      name: member.name, spouseName: currentSpouse || member.spouseName || '', date: new Date().toISOString().split('T')[0],
      classType: '정보수정', round: '0', residence: member.region, preference: currentPref, notes: currentNotes
    });
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === adminPassword) {
      setIsAuthorized(true);
      sessionStorage.setItem('admin_authorized', 'true');
    } else {
      setPasswordInput('');
      alert('비밀번호가 틀렸습니다.');
    }
  };

  const handleSaveUrl = () => {
    localStorage.setItem('apps_script_url', scriptUrl);
    setUrlSaveStatus(true);
    setTimeout(() => setUrlSaveStatus(false), 3000);
  };

  const NavContent = () => (
    <>
      <div className="mb-12 flex items-center space-x-3">
        <div className="w-12 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg text-[10px] font-black uppercase tracking-tighter">
          1516
        </div>
        <h1 className="text-lg font-bold text-gray-900 leading-tight">1516 새가족 관리<br/><span className="text-purple-600 text-xs">AI 데이터 비서</span></h1>
      </div>
      
      {result && (
        <div className="mb-8 p-4 bg-purple-50 rounded-2xl border border-purple-100">
          <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2">실시간 요약</p>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs text-purple-900 font-bold">배치 대기</p>
              <p className="text-2xl font-black text-purple-600">{result.placementTargets.length}명</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-purple-400 font-bold">전체 성도</p>
              <p className="text-sm font-bold text-purple-800">{result.ongoingMembers.length + result.completedMembers.length + result.placedMembers.length + result.placementTargets.length}명</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1 flex-1">
        {menuItems.map((tab) => (
          <button 
            key={tab.id} 
            onClick={() => {
              setActiveTab(tab.id as TabType);
              setIsMenuOpen(false);
            }} 
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all ${activeTab === tab.id ? 'bg-purple-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <div className="flex items-center space-x-3">
              <span className="text-base">{tab.icon}</span>
              <span className="font-bold text-sm">{tab.label}</span>
            </div>
            {tab.badge && result && result.placementTargets.length > 0 && (
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${activeTab === tab.id ? 'bg-white text-purple-600' : 'bg-purple-600 text-white animate-pulse'}`}>
                {result.placementTargets.length}
              </span>
            )}
          </button>
        ))}
      </div>
      
      <div className="mt-auto pt-8 space-y-4">
        <div className={`p-4 rounded-xl border flex items-center space-x-3 transition-colors ${connectionStatus === 'connected' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : connectionStatus === 'error' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
          <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
          <span className="text-[10px] font-bold uppercase tracking-wider">
            {connectionStatus === 'connected' ? '시트 연결됨' : connectionStatus === 'error' ? '연결 오류' : '설정 전'}
          </span>
        </div>
        <button onClick={() => { setActiveTab(TabType.ADMIN); setIsMenuOpen(false); }} className="w-full text-[10px] font-bold text-gray-400 hover:text-gray-600 text-center py-2">⚙️ 관리자 설정</button>
      </div>
    </>
  );

  const GroupedMemberGrid = ({ members, activeTab }: { members: Member[], activeTab: TabType }) => {
    const alpha = members.filter(m => m.region.includes('알파'));
    const sierra = members.filter(m => m.region.includes('시에라'));
    const other = members.filter(m => !m.region.includes('알파') && !m.region.includes('시에라'));

    return (
      <div className="space-y-12">
        {alpha.length > 0 && (
          <div>
            <SectionHeader title="알파" count={alpha.length} icon="🟣" colorClass="border-indigo-100 text-indigo-700" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {alpha.map((m, i) => <MemberCard key={i} member={m} highlight={m.status === 'TARGET'} onEdit={handleEditClick} onOpenPlacement={m.status === 'TARGET' ? (m) => setPlacingMember(m) : () => {}} />)}
            </div>
          </div>
        )}
        {sierra.length > 0 && (
          <div>
            <SectionHeader title="시에라" count={sierra.length} icon="🟢" colorClass="border-emerald-100 text-emerald-700" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sierra.map((m, i) => <MemberCard key={i} member={m} highlight={m.status === 'TARGET'} onEdit={handleEditClick} onOpenPlacement={m.status === 'TARGET' ? (m) => setPlacingMember(m) : () => {}} />)}
            </div>
          </div>
        )}
        {other.length > 0 && (
          <div>
            <SectionHeader title="기타/미지정" count={other.length} icon="⚪" colorClass="border-slate-100 text-slate-700" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {other.map((m, i) => <MemberCard key={i} member={m} highlight={m.status === 'TARGET'} onEdit={handleEditClick} onOpenPlacement={m.status === 'TARGET' ? (m) => setPlacingMember(m) : () => {}} />)}
            </div>
          </div>
        )}
        {members.length === 0 && (
          <div className="py-24 text-center">
            <div className="text-5xl mb-6 opacity-40">📭</div>
            <h3 className="text-xl font-bold text-gray-400">명단이 비어있습니다</h3>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900 font-['Noto_Sans_KR']">
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex w-72 bg-white border-r border-gray-200 p-8 flex-shrink-0 flex-col shadow-sm fixed h-full z-40">
        <NavContent />
      </nav>

      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center fixed top-0 w-full z-40 shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="px-2 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white text-[10px] font-black shadow-md">1516</div>
          <h1 className="text-sm font-bold text-gray-900">{menuItems.find(m => m.id === activeTab)?.label || '관리 시스템'}</h1>
        </div>
        <button onClick={() => setIsMenuOpen(true)} className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors relative">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
          {result && result.placementTargets.length > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-ping"></span>
          )}
        </button>
      </header>

      {/* Mobile Drawer */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}></div>
          <div className="absolute top-0 left-0 bottom-0 w-[80%] max-w-sm bg-white p-8 shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">
            <button onClick={() => setIsMenuOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <NavContent />
          </div>
        </div>
      )}

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-50 md:flex hidden flex-col items-end space-y-4">
        {isMenuOpen && (
          <div className="bg-white/80 backdrop-blur-xl border border-white p-4 rounded-3xl shadow-2xl mb-2 w-56 animate-in slide-in-from-bottom-4 zoom-in duration-200">
            <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest mb-3 ml-2">빠른 메뉴</p>
            <div className="space-y-1">
              {menuItems.map(item => (
                <button 
                  key={item.id} 
                  onClick={() => { setActiveTab(item.id as TabType); setIsMenuOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${activeTab === item.id ? 'bg-purple-600 text-white shadow-lg' : 'hover:bg-purple-50 text-gray-600'}`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-sm">{item.icon}</span>
                    <span className="text-xs font-bold">{item.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative ${isMenuOpen ? 'bg-gray-900 text-white rotate-45' : 'bg-purple-600 text-white hover:scale-110 active:scale-90'}`}
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
        </button>
      </div>

      <main className={`flex-1 overflow-y-auto p-6 md:p-10 relative md:ml-72 pt-24 md:pt-10`}>
        {isAnalyzing && (
          <div className="fixed inset-0 bg-white/60 backdrop-blur-[2px] z-[999] flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            <p className="text-purple-900 font-black tracking-tight">데이터 동기화 중...</p>
          </div>
        )}

        <div className="max-w-5xl mx-auto">
          {activeTab === TabType.IMPORT && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
              <div className="lg:col-span-7 bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-6">
                <h3 className="text-xl font-bold text-gray-800">새가족 정보 입력</h3>
                {currentMatch && (
                  <button 
                    onClick={() => handleLoadExistingMember(currentMatch)}
                    className="w-full px-4 py-3 bg-purple-50 text-purple-600 rounded-xl text-[12px] font-black border border-purple-200 hover:bg-purple-600 hover:text-white transition-all shadow-sm flex items-center justify-center space-x-2"
                  >
                    <span>💡 {currentMatch.name}님({currentMatch.attendanceCount}주) 정보 자동 완성</span>
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 ml-1 uppercase">이름</p>
                    <input type="text" value={currentEntry.name} onChange={e => setCurrentEntry({...currentEntry, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500" placeholder="성함" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 ml-1 uppercase">배우자 성함</p>
                    <input type="text" value={currentEntry.spouseName} onChange={e => setCurrentEntry({...currentEntry, spouseName: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500" placeholder="부부 성도인 경우" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 ml-1">출석 날짜</p>
                    <input type="date" value={currentEntry.date} onChange={e => setCurrentEntry({...currentEntry, date: e.target.value})} className="w-full p-4 bg-gray-50 border-0 rounded-2xl outline-none" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">수강 주차 선택</p>
                    <RoundSelector selected={currentEntry.round} attended={currentMatch?.attendedRounds || []} onSelect={(r) => setCurrentEntry({...currentEntry, round: r})} />
                  </div>
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">거주 지역 선택</p>
                  <div className="flex flex-wrap gap-2">
                    {alphaZones.map(z => <button key={z} onClick={() => setCurrentEntry({...currentEntry, residence: `${z} (알파)`})} className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all ${currentEntry.residence === `${z} (알파)` ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-indigo-400 border-indigo-100 hover:border-indigo-300'}`}>{z}</button>)}
                    {sierraZones.map(z => <button key={z} onClick={() => setCurrentEntry({...currentEntry, residence: `${z} (시에라)`})} className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all ${currentEntry.residence === `${z} (시에라)` ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-emerald-400 border-emerald-100 hover:border-emerald-300'}`}>{z}</button>)}
                  </div>
                </div>
                <button disabled={isSaving} onClick={() => handleAddEntry()} className={`w-full py-5 font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-2 ${isSaving ? 'bg-gray-400 text-white' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                  {isSaving ? "전송 중..." : "명단 추가하기"}
                </button>
              </div>
              <div className="lg:col-span-5 bg-white rounded-3xl p-8 border border-gray-100 h-[650px] flex flex-col shadow-sm">
                <h3 className="text-lg font-bold mb-6">최근 입력 로그</h3>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {recentLogs.map((log, i) => (
                    <div key={i} className={`p-4 rounded-xl border text-sm ${log.residence.includes('알파') ? 'bg-indigo-50 border-indigo-100' : log.residence.includes('시에라') ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}>
                      <p className="font-black text-gray-900">{log.name} {log.spouseName && <span className="text-rose-500 font-bold ml-1">👫 {log.spouseName}</span>}</p>
                      <p className="text-[11px] text-gray-500 mt-1 font-bold">{log.residence} | {log.round}주차</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result && activeTab === TabType.DASHBOARD && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="배치 대기" count={result.placementTargets.length} color={result.placementTargets.length > 0 ? "bg-purple-600 text-white shadow-xl shadow-purple-100" : "bg-white text-gray-400 border border-gray-200"} onClick={() => setActiveTab(TabType.TARGETS)} />
                <StatCard title="배치 완료" count={result.placedMembers.length} color="bg-white text-emerald-600 border-2 border-emerald-50 shadow-emerald-50 shadow-lg" onClick={() => setActiveTab(TabType.PLACED)} />
                <StatCard title="교육 진행 중" count={result.ongoingMembers.length} color="bg-white text-gray-900 border border-gray-200" onClick={() => setActiveTab(TabType.ONGOING)} />
                <StatCard title="전체 기록" count={result.totalAttendanceRecords} color="bg-gray-100 text-gray-500" />
              </div>

              {result.placementTargets.length > 0 ? (
                <div className="space-y-8">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-xl font-black border-l-4 border-purple-600 pl-4 uppercase tracking-tighter">순 배치 지부별 현황 ✨</h3>
                  </div>
                  <GroupedMemberGrid members={result.placementTargets} activeTab={activeTab} />
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-100 p-12 rounded-3xl text-center flex flex-col items-center">
                  <div className="text-4xl mb-4">🎉</div>
                  <h3 className="text-lg font-bold text-emerald-800">모든 배치가 완료되었습니다!</h3>
                </div>
              )}
            </div>
          )}

          {result && (activeTab === TabType.TARGETS || activeTab === TabType.PLACED || activeTab === TabType.ONGOING || activeTab === TabType.COMPLETED) && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <GroupedMemberGrid 
                members={
                  activeTab === TabType.TARGETS ? result.placementTargets :
                  activeTab === TabType.PLACED ? result.placedMembers :
                  activeTab === TabType.ONGOING ? result.ongoingMembers :
                  result.completedMembers
                } 
                activeTab={activeTab}
              />
            </div>
          )}

          {activeTab === TabType.ADMIN && (
            <div className="max-w-3xl mx-auto bg-white rounded-3xl p-10 border border-gray-100 space-y-8 animate-in zoom-in duration-300 shadow-sm">
              <h2 className="text-2xl font-bold">관리자 설정</h2>
              {!isAuthorized ? (
                <form onSubmit={handleAdminLogin} className="flex space-x-2">
                  <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="flex-1 p-4 bg-gray-50 rounded-2xl outline-none border border-gray-100" placeholder="비밀번호" />
                  <button type="submit" className="px-8 bg-gray-900 text-white font-bold rounded-2xl">인증</button>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <h4 className="text-sm font-bold text-emerald-800 mb-3 flex items-center">📝 Google Apps Script 연동</h4>
                    <input type="text" value={scriptUrl} onChange={e => setScriptUrl(e.target.value)} className="w-full p-4 bg-white border rounded-2xl outline-none text-xs" placeholder="URL 입력" />
                    <button onClick={handleSaveUrl} className="mt-3 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold w-full">{urlSaveStatus ? "저장됨" : "URL 저장"}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Editing Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-8 bg-purple-600 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold">{editingMember.name}님 수정</h3>
              <button onClick={() => setEditingMember(null)} className="text-3xl font-light">&times;</button>
            </div>
            <div className="p-8 space-y-6">
              <input type="text" value={editForm.spouseName} onChange={e => setEditForm({...editForm, spouseName: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl outline-none border border-gray-100" placeholder="배우자 성함" />
              <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="w-full p-4 bg-gray-50 rounded-2xl outline-none h-32 border border-gray-100" placeholder="특이사항" />
              <div className="flex space-x-3 pt-4">
                <button onClick={() => setEditingMember(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl">취소</button>
                <button disabled={isSaving} onClick={() => handleAddEntry(editForm)} className="flex-[2] py-4 bg-purple-600 text-white font-bold rounded-2xl shadow-xl shadow-purple-100">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Placement Modal */}
      {placingMember && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <div className={`p-6 ${getZoneTheme(placingMember.region).accent} text-white text-center`}>
              <h3 className="text-2xl font-black">{placingMember.name}님 순 배치</h3>
            </div>
            <div className="p-8 space-y-6">
              <input autoFocus type="text" value={smallGroupName} onChange={e => setSmallGroupName(e.target.value)} className="w-full p-5 bg-gray-50 border-2 rounded-2xl outline-none text-center text-lg font-black" placeholder="순 이름 입력 (예: 정자 1순)" onKeyPress={(e) => e.key === 'Enter' && handleConfirmPlacement()} />
              <div className="flex space-x-3">
                <button onClick={() => setPlacingMember(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl">취소</button>
                <button disabled={isSaving} onClick={handleConfirmPlacement} className={`flex-2 py-4 px-8 ${getZoneTheme(placingMember.region).accent} text-white font-black rounded-2xl`}>확정</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


export interface Member {
  name: string;
  spouseName?: string;
  attendanceCount: number;
  attendedRounds: number[]; // 수강한 구체적인 회차들 (예: [1, 3, 5])
  region: string;
  details: string; 
  status: 'TARGET' | 'ONGOING' | 'COMPLETED';
  isPlaced?: boolean;
}

export interface AnalysisResult {
  placementTargets: Member[];  // 4회 미배치
  placedMembers: Member[];     // 4회 배치완료
  ongoingMembers: Member[];    // 진행중
  completedMembers: Member[];  // 8회 수료
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

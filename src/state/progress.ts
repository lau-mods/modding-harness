import type { IssueSet } from '../review/issues.js';

// milestone の工程 (§22)
export type Phase = 'idle' | 'implementation' | 'build' | 'code_review' | 'gametest' | 'e2e' | 'checkpoint' | 'recovery' | 'complete' | 'fatal';

// 連続失敗回数を管理する工程 (§19.2)
export type FailurePhase = 'build' | 'gametest' | 'e2e';

// 全体の実行状態 (§7.3)
export type OverallStatus = 'idle' | 'running' | 'complete' | 'fatal';

// 進行中 milestone の途中進捗。recovery で初期化する (§7.3, §20.3)
export type MilestoneProgress = {
  id: string;
  baseCommit: string; // 復元基点 (直前 checkpoint、初回は plan を含む開発開始時の commit) (§20.2)
  failures: Record<FailurePhase, number>; // 工程ごとの連続失敗回数 (§19.2)
  recoveries: number; // 当該 milestone の recovery 回数 (§20.4)
  codeReview: IssueSet | null; // 初回 Code Review で固定した指摘集合 (§14.1)
  e2eReview: IssueSet | null; // 初回 E2E レビューで固定した指摘集合 (§17.1)
};

// fatal error の記録 (§23)
export type FatalRecord = { phase: Phase; reason: string; at: string };

// .harness-state/progress.json の内容。Git 管理対象で checkpoint commit に含める (§7.1, §7.3, §22)
export type Progress = {
  status: OverallStatus;
  phase: Phase;
  current: MilestoneProgress | null;
  completed: string[]; // 完成した milestone ID
  lastCheckpoint: string | null; // 直前 checkpoint の commit
  fatal: FatalRecord | null;
};

// plan 確定時の初期 progress を返す (§9.6)
export function initialProgress(): Progress {
  throw new Error('Not implemented');
}

// progress.json を読む。存在しなければ null、解釈できなければ FatalError (§23)
export async function loadProgress(root: string): Promise<Progress | null> {
  throw new Error('Not implemented');
}

// progress.json を保存する (§7.1)
export async function saveProgress(root: string, progress: Progress): Promise<void> {
  throw new Error('Not implemented');
}

// milestone 開始時の途中進捗を作る。recovery 回数は引き継ぐ (§20.3)
export function newMilestoneProgress(id: string, baseCommit: string, recoveries: number): MilestoneProgress {
  throw new Error('Not implemented');
}

// 全工程の連続失敗回数が 0 の記録を返す
export function zeroFailures(): Record<FailurePhase, number> {
  throw new Error('Not implemented');
}

import type { ReviewIssue } from '../review/issues.js';
import type { OverallStatus, Phase } from '../state/progress.js';

// harness status の表示内容 (§9.5, §22)
export type StatusReport = {
  project: string;
  currentCommit: string;
  currentMilestone: string | null;
  currentPhase: Phase;
  completedMilestones: string[];
  remainingMilestones: string[];
  buildRetries: number;
  gameTestRetries: number;
  e2eRetries: number;
  recoveries: number;
  openCodeReviewIssues: ReviewIssue[];
  openE2EIssues: ReviewIssue[];
  lastCheckpoint: string | null;
  overallStatus: OverallStatus;
  fatal: string | null;
};

// PROJECT.md・plan・progress・Git から状態表示用の情報を集める。develop 実行中も参照できる (§3, §9.5)
export async function collectStatus(root: string): Promise<StatusReport> {
  throw new Error('Not implemented');
}

// StatusReport を端末表示用のテキストにする (§22)
export function formatStatus(report: StatusReport): string {
  throw new Error('Not implemented');
}

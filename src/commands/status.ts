import type { ReviewIssue } from '../review/issues.js';
import type { Phase, RetryState } from '../state/state.js';

// harness status の表示内容 (§24)
export type StatusReport = {
  projectStatus: 'draft' | 'active' | 'complete';
  checkpoint: string | null;
  milestone: string | null;
  phase: Phase;
  completedMilestones: string[];
  remainingMilestones: string[];
  reviewIssues: ReviewIssue[]; // コードレビュー・画面確認の指摘とその現在状態
  scenario: string | null;
  retry: RetryState | null;
  rollbackCount: number;
};

// state / 計画 / Git から状態表示用の情報を集める (§24, §29)
export async function collectStatus(root: string): Promise<StatusReport> {
  throw new Error('Not implemented');
}

// StatusReport を端末表示用のテキストにする
export function formatStatus(report: StatusReport): string {
  throw new Error('Not implemented');
}

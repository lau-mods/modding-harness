import { loadPlan } from '../plan/plan.js';
import type { ReviewIssue } from '../review/issues.js';
import { readProject } from '../spec/parser.js';
import { loadState } from '../state/state.js';
import type { Phase, RetryState } from '../state/state.js';
import { MAX_ATTEMPTS } from '../core/retry.js';

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
  fatal: string | null;
};

// state / 計画 / PROJECT.md から状態表示用の情報を集める (§24, §29)
export async function collectStatus(root: string): Promise<StatusReport> {
  const state = await loadState(root);
  const plan = await loadPlan(root);
  const spec = await readProject(root).catch(() => null);
  const runtime = state.milestone;
  const completed = state.checkpoints.map(checkpoint => checkpoint.milestone);
  return {
    projectStatus: state.phase === 'complete' ? 'complete' : spec?.status ?? 'draft',
    checkpoint: state.checkpoints.at(-1)?.commit ?? null,
    milestone: state.currentMilestone,
    phase: state.phase,
    completedMilestones: completed,
    remainingMilestones: plan?.milestones.map(milestone => milestone.id).filter(id => !completed.includes(id)) ?? [],
    reviewIssues: [...runtime?.codeReview?.issues ?? [], ...runtime?.visualReview?.issues ?? []],
    scenario: runtime?.scenario ?? null,
    retry: state.retry,
    rollbackCount: state.rollbacks.length,
    fatal: state.fatal?.reason ?? null,
  };
}

// StatusReport を端末表示用のテキストにする
export function formatStatus(report: StatusReport): string {
  const list = (items: string[]): string => items.length ? items.join(', ') : '-';
  const lines = [
    `Project status:       ${report.projectStatus}`,
    `Current checkpoint:   ${report.checkpoint ?? '-'}`,
    `Current milestone:    ${report.milestone ?? '-'}`,
    `Current phase:        ${report.phase}`,
    `Completed milestones: ${list(report.completedMilestones)}`,
    `Remaining milestones: ${list(report.remainingMilestones)}`,
    `Review issues:        ${report.reviewIssues.length ? '' : '-'}`,
    ...report.reviewIssues.map(issue => `  ${issue.id} [${issue.status}] ${issue.title}`),
    `Current E2E scenario: ${report.scenario ?? '-'}`,
    `Retry:                ${report.retry ? `${report.retry.operation} attempt ${report.retry.attempt}/${MAX_ATTEMPTS}` : '-'}`,
    `Rollback count:       ${report.rollbackCount}`,
  ];
  if (report.fatal) lines.push(`Fatal:                ${report.fatal}`);
  return lines.join('\n');
}

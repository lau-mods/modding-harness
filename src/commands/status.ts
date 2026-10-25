import { findCheckpoint, head } from '../git/git.js';
import { loadPlan } from '../plan/plan.js';
import type { ReviewIssue } from '../review/issues.js';
import { openIssues } from '../review/issues.js';
import { readProject } from '../spec/parser.js';
import { initialProgress, loadProgress } from '../state/progress.js';
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
  const spec = await readProject(root).catch(() => null);
  const plan = await loadPlan(root);
  const progress = await loadProgress(root) ?? initialProgress();
  const current = progress.current;
  const completed = progress.completed;
  // checkpoint commit は自身の hash を progress に含められないため、完成済み milestone の checkpoint は履歴から求める
  const lastCompleted = completed.at(-1);
  return {
    project: spec ? spec.projectId || spec.modId || '-' : '-',
    currentCommit: await head(root),
    currentMilestone: current?.id ?? null,
    currentPhase: progress.phase,
    completedMilestones: completed,
    remainingMilestones: plan?.milestones.map(milestone => milestone.id).filter(id => !completed.includes(id)) ?? [],
    buildRetries: current?.failures.build ?? 0,
    gameTestRetries: current?.failures.gametest ?? 0,
    e2eRetries: current?.failures.e2e ?? 0,
    recoveries: current?.recoveries ?? 0,
    openCodeReviewIssues: openIssues(current?.codeReview ?? null),
    openE2EIssues: openIssues(current?.e2eReview ?? null),
    lastCheckpoint: (lastCompleted && await findCheckpoint(root, lastCompleted)) ?? progress.lastCheckpoint,
    overallStatus: progress.status,
    fatal: progress.fatal ? `${progress.fatal.reason} (phase: ${progress.fatal.phase}, at ${progress.fatal.at})` : null,
  };
}

// StatusReport を端末表示用のテキストにする (§22)
export function formatStatus(report: StatusReport): string {
  const list = (items: string[]): string => items.length ? items.join(', ') : '-';
  const issues = (items: ReviewIssue[]): string[] => items.length ? items.map(issue => `  ${issue.id} ${issue.target}: ${issue.problem}`) : [];
  const lines = [
    `Project:                  ${report.project}`,
    `Current Commit:           ${report.currentCommit}`,
    `Current Milestone:        ${report.currentMilestone ?? '-'}`,
    `Current Phase:            ${report.currentPhase}`,
    '',
    `Completed Milestones:     ${list(report.completedMilestones)}`,
    `Remaining Milestones:     ${list(report.remainingMilestones)}`,
    '',
    `Build Retry Count:        ${report.buildRetries}`,
    `GameTest Retry Count:     ${report.gameTestRetries}`,
    `E2E Retry Count:          ${report.e2eRetries}`,
    `Milestone Recovery Count: ${report.recoveries}`,
    '',
    `Open Code Review Issues:  ${report.openCodeReviewIssues.length}`,
    ...issues(report.openCodeReviewIssues),
    `Open E2E Issues:          ${report.openE2EIssues.length}`,
    ...issues(report.openE2EIssues),
    '',
    `Last Checkpoint:          ${report.lastCheckpoint ?? '-'}`,
    `Overall Status:           ${report.overallStatus}`,
  ];
  if (report.fatal) lines.push(`Fatal:                    ${report.fatal}`);
  return lines.join('\n');
}

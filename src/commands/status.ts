import { findCheckpoint, head } from '../git/git.js';
import { loadPlan } from '../plan/plan.js';
import type { ReviewIssue } from '../review/issues.js';
import { openIssues } from '../review/issues.js';
import { readProject } from '../spec/parser.js';
import { initialProgress, loadProgress } from '../state/progress.js';
import type { MilestoneProgress, OverallStatus, Phase } from '../state/progress.js';

// 進行中 milestone 1 件分の表示内容 (§22)
export type ActiveMilestoneReport = {
  id: string;
  phase: Phase;
  buildRetries: number;
  gameTestRetries: number;
  e2eRetries: number;
  recoveries: number;
  openCodeReviewIssues: ReviewIssue[];
  openE2EIssues: ReviewIssue[];
};

// harness status の表示内容 (§9.5, §22)
export type StatusReport = {
  project: string;
  currentCommit: string;
  activeMilestones: ActiveMilestoneReport[]; // 並列に進行中の milestone (§10.3)
  completedMilestones: string[];
  remainingMilestones: string[];
  lastCheckpoint: string | null;
  overallStatus: OverallStatus;
  fatal: string | null;
};

// PROJECT.md・plan・progress・Git から状態表示用の情報を集める。develop 実行中も参照できる (§3, §9.5)
export async function collectStatus(root: string): Promise<StatusReport> {
  const spec = await readProject(root).catch(() => null);
  const plan = await loadPlan(root);
  const progress = await loadProgress(root) ?? initialProgress();
  const completed = progress.completed;
  // checkpoint commit は自身の hash を progress に含められないため、完成済み milestone の checkpoint は履歴から求める
  const lastCompleted = completed.at(-1);
  const fatal = progress.fatal;
  return {
    project: spec ? spec.projectId || spec.modId || '-' : '-',
    currentCommit: await head(root).catch(() => '-'), // 最初の commit 前は HEAD が無い
    activeMilestones: progress.active.map(activeReport),
    completedMilestones: completed,
    remainingMilestones: plan?.milestones.map(milestone => milestone.id).filter(id => !completed.includes(id)) ?? [],
    lastCheckpoint: (lastCompleted && await findCheckpoint(root, lastCompleted)) ?? progress.lastCheckpoint,
    overallStatus: progress.status,
    fatal: fatal ? `${fatal.reason} (${fatal.milestone ? `milestone: ${fatal.milestone}, ` : ''}phase: ${fatal.phase}, at ${fatal.at})` : null,
  };
}

function activeReport(current: MilestoneProgress): ActiveMilestoneReport {
  return {
    id: current.id,
    phase: current.phase,
    buildRetries: current.failures.build,
    gameTestRetries: current.failures.gametest,
    e2eRetries: current.failures.e2e,
    recoveries: current.recoveries,
    openCodeReviewIssues: openIssues(current.codeReview),
    openE2EIssues: openIssues(current.e2eReview),
  };
}

// StatusReport を端末表示用のテキストにする (§22)
export function formatStatus(report: StatusReport): string {
  const list = (items: string[]): string => items.length ? items.join(', ') : '-';
  const issues = (items: ReviewIssue[]): string[] => items.length ? items.map(issue => `    ${issue.id} ${issue.target}: ${issue.problem}`) : [];
  const lines = [
    `Project:                  ${report.project}`,
    `Current Commit:           ${report.currentCommit}`,
    `Active Milestones:        ${list(report.activeMilestones.map(milestone => milestone.id))}`,
    ...report.activeMilestones.flatMap(milestone => [
      '',
      `${milestone.id}`,
      `  Phase:                    ${milestone.phase}`,
      `  Build Retry Count:        ${milestone.buildRetries}`,
      `  GameTest Retry Count:     ${milestone.gameTestRetries}`,
      `  E2E Retry Count:          ${milestone.e2eRetries}`,
      `  Milestone Recovery Count: ${milestone.recoveries}`,
      `  Open Code Review Issues:  ${milestone.openCodeReviewIssues.length}`,
      ...issues(milestone.openCodeReviewIssues),
      `  Open E2E Issues:          ${milestone.openE2EIssues.length}`,
      ...issues(milestone.openE2EIssues),
    ]),
    '',
    `Completed Milestones:     ${list(report.completedMilestones)}`,
    `Remaining Milestones:     ${list(report.remainingMilestones)}`,
    '',
    `Last Checkpoint:          ${report.lastCheckpoint ?? '-'}`,
    `Overall Status:           ${report.overallStatus}`,
  ];
  if (report.fatal) lines.push(`Fatal:                    ${report.fatal}`);
  return lines.join('\n');
}

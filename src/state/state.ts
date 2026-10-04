import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { BuildResult } from '../build/gradle.js';
import { FatalError } from '../core/errors.js';
import { exists, readJson, writeAtomic } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
import type { E2EFailureReport, E2ERunSummary } from '../e2e/e2e.js';
import type { ScenarioDefinition } from '../e2e/manifest.js';
import type { IssueSet } from '../review/issues.js';

// 開発処理の phase (§24)
export type Phase = 'idle' | 'preflight' | 'planning' | 'implementation' | 'build' | 'code_review' | 'e2e' | 'visual_review' | 'checkpoint' | 'rollback' | 'fatal' | 'complete';

// checkpoint commit の記録 (§21)
export type CheckpointRecord = { milestone: string; commit: string; acIds: string[]; createdAt: string };

// rollback の履歴 (§29)
export type RollbackRecord = { milestone: string; operation: string; reason: string; restoredTo: string; at: string };

// 外部実行の再試行状況 (§24 Retry count)
export type RetryState = { operation: string; attempt: number };

// 進行中 milestone の実行時状態。rollback で初期化する (§18)
export type MilestoneRuntime = {
  milestone: string;
  baseCommit: string; // 復元地点 (直前 checkpoint または開発開始時の HEAD)
  iteration: number; // Codex による実装・修正の回数
  buildFailure: BuildResult | null; // Codex に差し戻す compile / build 失敗
  codeReview: IssueSet | null; // 初回コードレビューで固定した指摘集合
  visualReview: IssueSet | null; // 初回画面確認で固定した指摘集合
  e2e: E2ERunSummary | null; // 直前の E2E 結果
  e2eFailure: E2EFailureReport | null; // Codex に差し戻す E2E 失敗
  scenario: string | null; // 実行中の E2E scenario
  passedScenarios: ScenarioDefinition[]; // 一度成功した scenario。再実行と変更を行わない
};

// Harness の永続化された実行状態
export type HarnessState = {
  phase: Phase;
  planLocked: boolean; // milestone 実装開始から開発実行完了まで計画を固定する (§6)
  currentMilestone: string | null;
  checkpoints: CheckpointRecord[];
  milestone: MilestoneRuntime | null;
  retry: RetryState | null;
  rollbacks: RollbackRecord[];
  fatal: { reason: string; at: string } | null;
};

// 未実行 project の初期状態を返す
export function initialState(): HarnessState {
  return { phase: 'idle', planLocked: false, currentMilestone: null, checkpoints: [], milestone: null, retry: null, rollbacks: [], fatal: null };
}

// 状態を読む。存在しなければ初期状態、読めなければ FatalError (§20)
export async function loadState(root: string): Promise<HarnessState> {
  const file = projectPaths(root).state;
  if (!await exists(file)) return initialState();
  try { return await readJson(file) as HarnessState; }
  catch (error) { throw new FatalError(`Cannot read harness state: ${(error as Error).message}`); }
}

// 状態を保存する
export async function saveState(root: string, state: HarnessState): Promise<void> {
  await writeAtomic(projectPaths(root).state, state);
}

// milestone 開始時 (rollback 後の再開を含む) の runtime state を作る
export function newMilestoneRuntime(milestone: string, baseCommit: string): MilestoneRuntime {
  return { milestone, baseCommit, iteration: 0, buildFailure: null, codeReview: null, visualReview: null, e2e: null, e2eFailure: null, scenario: null, passedScenarios: [] };
}

// 計画が固定中であれば計画・仕様の変更を拒否する (§6, §23)
export function assertPlanMutable(state: HarnessState): void {
  if (state.planLocked) throw new Error('The plan is fixed until harness develop completes; finish development before changing the plan or specification');
}

// 同一 project で Harness が多重実行されないよう排他して action を実行する
export async function withLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const file = projectPaths(root).lock;
  await mkdir(path.dirname(file), { recursive: true });
  let handle;
  try { handle = await open(file, 'wx'); }
  catch { throw new Error(`Another harness process holds ${path.relative(root, file)}; remove it when that process has ended`); }
  try {
    await handle.writeFile(String(process.pid));
    return await action();
  } finally {
    await handle.close();
    await unlink(file);
  }
}

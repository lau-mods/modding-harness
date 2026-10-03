import type { RetryExhausted } from '../core/errors.js';
import type { E2ERunSummary } from '../e2e/e2e.js';
import type { Milestone } from '../plan/plan.js';
import type { CheckpointRecord } from '../state/state.js';
import type { WorkflowContext } from './context.js';

// milestone 内の工程 (§7, §30)
export type Step = 'implementation' | 'build' | 'code_review' | 'e2e' | 'visual_review' | 'checkpoint';

// milestone を checkpoint まで進める。RetryExhausted なら rollback して同じ milestone を最初から再実行する (§18)
export async function runMilestone(ctx: WorkflowContext, milestone: Milestone): Promise<CheckpointRecord> {
  throw new Error('Not implemented');
}

// rollback を挟まない milestone 1 周分の実行。§30 の状態遷移に従って工程を繰り返す
export async function attemptMilestone(ctx: WorkflowContext, milestone: Milestone): Promise<CheckpointRecord> {
  throw new Error('Not implemented');
}

// Codex に実装・修正を依頼し、指摘への accepted 応答を指摘集合へ反映する (§8, §11)
export async function implementationStep(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  throw new Error('Not implemented');
}

// compile → build を実行する。失敗時は結果を Codex 差し戻し用に保存して false を返す (§9)
export async function buildStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  throw new Error('Not implemented');
}

// 初回は指摘集合を固定し、以降は初回指摘だけを再確認する。全指摘が解決済みなら true (§10, §11)
export async function codeReviewStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  throw new Error('Not implemented');
}

// 実機 E2E を再試行規則付きで実行して結果を記録する。assertion failure は Codex 差し戻し用に保存する (§12, §19)
export async function e2eStep(ctx: WorkflowContext, milestone: Milestone): Promise<E2ERunSummary> {
  throw new Error('Not implemented');
}

// screenshot がある場合に画面確認を行う。初回は指摘集合を固定し、以降は再確認のみ。全指摘が解決済みなら true (§15, §16)
export async function visualReviewStep(ctx: WorkflowContext, milestone: Milestone, e2e: E2ERunSummary): Promise<boolean> {
  throw new Error('Not implemented');
}

// checkpoint commit を作成して state に記録する (§21)
export async function checkpointStep(ctx: WorkflowContext, milestone: Milestone): Promise<CheckpointRecord> {
  throw new Error('Not implemented');
}

// 直前 checkpoint へ復元し、milestone の一時成果物と runtime state を初期化して rollback 履歴を残す (§18)
export async function rollbackMilestone(ctx: WorkflowContext, milestone: Milestone, failure: RetryExhausted): Promise<void> {
  throw new Error('Not implemented');
}

import type { E2ERunSummary } from '../e2e/e2e.js';
import type { Milestone } from '../plan/plan.js';
import type { WorkflowContext } from './context.js';
import type { RecoveryRequired } from './retry.js';

// milestone を checkpoint まで進める。RecoveryRequired なら復元して同じ milestone を最初から再実行する (§10.2, §20.4)
export async function runMilestone(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  throw new Error('Not implemented');
}

// recovery を挟まない milestone 1 周分の実行。工程が失敗・未解決なら Codex 修正から関連工程を再実行する (§10.2, §18)
export async function attemptMilestone(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  throw new Error('Not implemented');
}

// Codex に実装または修正を依頼し、指摘への accepted 応答を指摘集合へ反映する (§11, §14.2, §17.2)
export async function implementationStep(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  throw new Error('Not implemented');
}

// compile → build を実行する。成功なら true (§13)
export async function buildStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  throw new Error('Not implemented');
}

// 初回は指摘集合を固定し、以降は固定済み指摘の状態だけを更新する。全指摘が resolved / accepted なら true (§14)
export async function codeReviewStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  throw new Error('Not implemented');
}

// 対象 AC の GameTest を実行して report を照合する。全件成功なら true (§15)
export async function gameTestStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  throw new Error('Not implemented');
}

// 描画 AC を含む milestone で E2E scenario を実行する。対象外なら空の結果、実行失敗なら null (§10.2, §16)
export async function e2eStep(ctx: WorkflowContext, milestone: Milestone): Promise<E2ERunSummary | null> {
  throw new Error('Not implemented');
}

// 初回は指摘集合を固定し、以降は固定済み指摘の状態だけを更新する。全指摘が resolved / accepted なら true (§17)
export async function e2eReviewStep(ctx: WorkflowContext, milestone: Milestone, summary: E2ERunSummary): Promise<boolean> {
  throw new Error('Not implemented');
}

// 完成条件を確認し、完成状態の progress を含む checkpoint commit を作る (§21)
export async function checkpointStep(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  throw new Error('Not implemented');
}

// 現在 milestone の変更を破棄して直前 checkpoint へ復元し、途中進捗・指摘集合・runtime 状態を初期化する (§20.2, §20.3)
export async function recoverMilestone(ctx: WorkflowContext, milestone: Milestone, cause: RecoveryRequired): Promise<void> {
  throw new Error('Not implemented');
}

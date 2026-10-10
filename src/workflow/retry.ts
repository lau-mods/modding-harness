import { ExecutionFailure } from '../core/errors.js';
import type { FailureReport } from '../core/errors.js';
import { recordRun } from '../core/runs.js';
import type { FailurePhase } from '../state/progress.js';
import { currentMilestone, saveContext } from './context.js';
import type { WorkflowContext } from './context.js';

// 初回実行後の修正再試行の上限 (§19.2)
export const MAX_REPAIRS = 3;

// 修正再試行を使い切ったこと。checkpoint recovery の契機 (§20.1)
export class RecoveryRequired extends Error {
  constructor(readonly phase: FailurePhase, readonly report: FailureReport) {
    super(`${phase} failed after ${MAX_REPAIRS} repairs: ${report.summary}`);
  }
}

// 工程の実行失敗を記録し、Codex 修正用に保持する。修正再試行の上限を超えたら RecoveryRequired を投げる (§19.2)
export async function recordFailure(ctx: WorkflowContext, phase: FailurePhase, failure: ExecutionFailure): Promise<void> {
  const current = currentMilestone(ctx);
  const count = ++current.failures[phase];
  ctx.failure = failure.report(phase);
  await saveContext(ctx);
  process.stderr.write(`[harness] ${current.id} ${phase} failed (${count}/${MAX_REPAIRS + 1}): ${failure.message}\n`);
  if (count > MAX_REPAIRS) throw new RecoveryRequired(phase, ctx.failure);
}

// 工程の成功で連続失敗回数を 0 に戻す (§19.2)
export async function recordSuccess(ctx: WorkflowContext, phase: FailurePhase): Promise<void> {
  currentMilestone(ctx).failures[phase] = 0;
  await saveContext(ctx);
}

// 工程を実行し、ExecutionFailure なら失敗を記録して null を返す。成功なら結果を返して連続失敗回数を戻す (§19.2)
export async function attempt<T>(ctx: WorkflowContext, phase: FailurePhase, action: (logDir: string) => Promise<T>): Promise<T | null> {
  try {
    const result = await recordRun(ctx.root, currentMilestone(ctx).id, phase, action);
    await recordSuccess(ctx, phase);
    return result;
  } catch (error) {
    if (!(error instanceof ExecutionFailure)) throw error;
    await recordFailure(ctx, phase, error);
    return null;
  }
}

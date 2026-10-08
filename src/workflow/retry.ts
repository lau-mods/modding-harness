import type { ExecutionFailure, FailureReport } from '../core/errors.js';
import type { FailurePhase } from '../state/progress.js';
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
  throw new Error('Not implemented');
}

// 工程の成功で連続失敗回数を 0 に戻す (§19.2)
export async function recordSuccess(ctx: WorkflowContext, phase: FailurePhase): Promise<void> {
  throw new Error('Not implemented');
}

// 工程を実行し、ExecutionFailure なら失敗を記録して null を返す。成功なら結果を返して連続失敗回数を戻す (§19.2)
export async function attempt<T>(ctx: WorkflowContext, phase: FailurePhase, action: (logDir: string) => Promise<T>): Promise<T | null> {
  throw new Error('Not implemented');
}

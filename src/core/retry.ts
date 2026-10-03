import type { ExecutionFailure } from './errors.js';

// 同一処理の最大実行回数 (§17)
export const MAX_ATTEMPTS = 3;

// 再試行の進捗を state や実行記録へ反映するためのフック (§24 Retry count)
export type RetryHooks = {
  onAttempt?: (attempt: number) => Promise<void>;
  onFailure?: (attempt: number, failure: ExecutionFailure) => Promise<void>;
};

// ExecutionFailure の間は同一状態のまま最大 3 回実行し、尽きたら RetryExhausted を投げる。他の例外は即座に伝播する (§17)
export async function withRetry<T>(operation: string, action: (attempt: number) => Promise<T>, hooks?: RetryHooks): Promise<T> {
  throw new Error('Not implemented');
}

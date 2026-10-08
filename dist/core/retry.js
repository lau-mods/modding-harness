import { ExecutionFailure, RetryExhausted } from './errors.js';
// 同一処理の最大実行回数 (§17)
export const MAX_ATTEMPTS = 3;
// ExecutionFailure の間は同一状態のまま最大 3 回実行し、尽きたら RetryExhausted を投げる。他の例外はそのまま伝播する (§17)
export async function withRetry(operation, action, hooks) {
    for (let attempt = 1;; attempt++) {
        await hooks?.onAttempt?.(attempt);
        try {
            return await action(attempt);
        }
        catch (error) {
            if (!(error instanceof ExecutionFailure))
                throw error;
            if (attempt >= MAX_ATTEMPTS)
                throw new RetryExhausted(operation, attempt, error);
        }
    }
}
//# sourceMappingURL=retry.js.map
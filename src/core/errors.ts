// Harness が自律的に処理を継続できない状態。処理を停止して原因を利用者へ表示する (§20)
export class FatalError extends Error {}

// 外部プロセスまたは実行環境上の失敗。同一状態での再試行対象 (§17)
export class ExecutionFailure extends Error {
  constructor(message: string, readonly operation: string, options?: ErrorOptions) {
    super(message, options);
  }
}

// 同一処理が上限回数まで連続して失敗したこと。milestone rollback の契機 (§18)
export class RetryExhausted extends Error {
  constructor(readonly operation: string, readonly attempts: number, readonly lastFailure: ExecutionFailure) {
    super(`${operation} failed ${attempts} times`, { cause: lastFailure });
  }
}

// 捕捉した例外を分類する。想定外の例外は Harness 内部の継続不能な例外として FatalError に変換する (§20)
export function classifyError(error: unknown): FatalError | ExecutionFailure | RetryExhausted {
  throw new Error('Not implemented');
}

// 修正再試行の対象となる実行失敗で、Codex へ渡す失敗情報 (§19.1)
export type FailureReport = {
  phase: string; // 失敗した工程
  summary: string; // 失敗の要約
  details: string; // エラー出力・assertion・観測値など
  logs: string[]; // 関連する log file のパス
  screenshots: string[]; // 関連する screenshot のパス
};

// Harness が workflow を継続する基本条件を失った状態。処理を終了して原因と工程を表示する (§23)
export class FatalError extends Error {}

// 修正再試行の対象となる実行失敗 (§19.1)
export class ExecutionFailure extends Error {
  constructor(summary: string, readonly details = '', readonly logs: string[] = [], readonly screenshots: string[] = []) {
    super(summary);
  }

  // 失敗した工程を付けて Codex へ渡す失敗情報にする
  report(phase: string): FailureReport {
    return { phase, summary: this.message, details: this.details, logs: this.logs, screenshots: this.screenshots };
  }
}

// 捕捉した例外を FatalError として扱う。Harness 内部の想定外の例外も継続不能とする (§23)
export function toFatal(error: unknown): FatalError {
  if (error instanceof FatalError) return error;
  return new FatalError(error instanceof Error ? error.message : String(error), { cause: error });
}

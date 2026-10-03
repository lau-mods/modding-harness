// 外部コマンドの終了結果
export type ProcessResult = { code: number; stdout: string; stderr: string; durationMs: number };
// 外部コマンドの実行設定。logDir を指定すると stdout/stderr をファイルにも保存する (§29)
export type ProcessOptions = { cwd: string; input?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; logDir?: string };
// テストで差し替え可能な外部コマンド実行関数
export type Runner = (command: string, args: string[], options: ProcessOptions) => Promise<ProcessResult>;

// shell を介さずに外部コマンドを実行する。executable が存在しない場合は FatalError (§20)
export async function run(command: string, args: string[], options: ProcessOptions): Promise<ProcessResult> {
  throw new Error('Not implemented');
}

// 終了コードが 0 でなければ ExecutionFailure を投げる (§17)
export function requireSuccess(result: ProcessResult, operation: string): ProcessResult {
  throw new Error('Not implemented');
}

// 外部コマンドの終了結果
export type ProcessResult = { code: number; stdout: string; stderr: string; durationMs: number };

// 外部コマンドの実行設定。logDir を指定すると command.json と stdout/stderr をそこへ保存する
export type ProcessOptions = { cwd: string; input?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; logDir?: string };

// テストで差し替え可能な外部コマンド実行関数
export type Runner = (command: string, args: string[], options: ProcessOptions) => Promise<ProcessResult>;

// 外部コマンドを argv のまま実行する。executable が無ければ FatalError、timeout は ExecutionFailure (§19.1, §23)
export async function run(command: string, args: string[], options: ProcessOptions): Promise<ProcessResult> {
  throw new Error('Not implemented');
}

// 終了コードが 0 でなければ ExecutionFailure を投げる (§19.1)
export function requireSuccess(result: ProcessResult, operation: string): ProcessResult {
  throw new Error('Not implemented');
}

// 文字列の末尾 length 文字を返す
export function tail(text: string, length: number): string {
  throw new Error('Not implemented');
}

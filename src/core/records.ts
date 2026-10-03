// 外部実行 1 回分の記録。何を・何回目に実行し、成功したか・失敗理由を残す (§29)
export type ExecutionRecord = {
  operation: string;
  milestone: string | null;
  attempt: number;
  command: string[];
  startedAt: string;
  finishedAt: string;
  success: boolean;
  failure: string | null;
  logDir: string; // stdout/stderr 等の保存先
};

// 実行 1 回分の記録ディレクトリを確保してパスを返す
export async function allocateRunDir(root: string, operation: string, milestone: string | null, attempt: number): Promise<string> {
  throw new Error('Not implemented');
}

// 実行記録を保存する
export async function writeRecord(root: string, record: ExecutionRecord): Promise<void> {
  throw new Error('Not implemented');
}

// 実行記録を古い順に読む。milestone 指定時はその milestone の記録のみ返す
export async function readRecords(root: string, milestone?: string): Promise<ExecutionRecord[]> {
  throw new Error('Not implemented');
}

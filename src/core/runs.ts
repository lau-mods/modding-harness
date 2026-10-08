// 工程の実行 1 回分の記録。runs/ 配下に run ごとに保存する (§7.2)
export type RunRecord = {
  milestone: string | null;
  step: string; // build・gametest・e2e・code_review など
  attempt: number;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  failure: string | null;
  logDir: string;
};

// 実行 1 回分の記録ディレクトリを runs/ 配下に確保してパスを返す (§7.2)
export async function allocateRunDir(root: string, milestone: string | null, step: string, attempt: number): Promise<string> {
  throw new Error('Not implemented');
}

// 実行記録を logDir の record.json として保存する
export async function writeRunRecord(record: RunRecord): Promise<void> {
  throw new Error('Not implemented');
}

// 記録ディレクトリを確保して action を実行し、成否を RunRecord として保存する
export async function recordRun<T>(root: string, milestone: string | null, step: string, attempt: number, action: (logDir: string) => Promise<T>): Promise<T> {
  throw new Error('Not implemented');
}

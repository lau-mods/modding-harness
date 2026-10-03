import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { exists, readJson, writeAtomic } from './fs.js';
import { projectPaths } from './paths.js';

// 外部実行 1 回分の記録。何を・何回目に実行し、成功したか・失敗理由を残す (§29)
export type ExecutionRecord = {
  operation: string;
  milestone: string | null;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  failure: string | null;
  logDir: string; // command.json・stdout/stderr・結果ファイルの保存先
};

let sequence = 0;

// 実行 1 回分の記録ディレクトリを確保してパスを返す
export async function allocateRunDir(root: string, operation: string, milestone: string | null, attempt: number): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(projectPaths(root).runs, `${stamp}-${String(++sequence).padStart(3, '0')}-${milestone ?? 'project'}-${operation}-${attempt}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// 実行記録を logDir の record.json として保存する
export async function writeRecord(record: ExecutionRecord): Promise<void> {
  await writeAtomic(path.join(record.logDir, 'record.json'), record);
}

// 実行記録を古い順に読む。milestone 指定時はその milestone の記録だけを返す
export async function readRecords(root: string, milestone?: string): Promise<ExecutionRecord[]> {
  const runs = projectPaths(root).runs;
  if (!await exists(runs)) return [];
  const records: ExecutionRecord[] = [];
  for (const name of (await readdir(runs)).sort()) {
    const file = path.join(runs, name, 'record.json');
    if (await exists(file)) records.push(await readJson(file) as ExecutionRecord);
  }
  return milestone === undefined ? records : records.filter(record => record.milestone === milestone);
}

// 記録ディレクトリを確保して action を実行し、成否を実行記録として保存する (§29)
export async function recordExecution<T>(root: string, operation: string, milestone: string | null, attempt: number, action: (logDir: string) => Promise<T>): Promise<T> {
  const logDir = await allocateRunDir(root, operation, milestone, attempt);
  const startedAt = new Date().toISOString();
  const record = (success: boolean, failure: string | null): Promise<void> =>
    writeRecord({ operation, milestone, attempt, startedAt, finishedAt: new Date().toISOString(), success, failure, logDir });
  try {
    const result = await action(logDir);
    await record(true, null);
    return result;
  } catch (error) {
    await record(false, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

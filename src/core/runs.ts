import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeAtomic } from './fs.js';
import { projectPaths } from './paths.js';

// 工程の実行 1 回分の記録。runs/ 配下に run ごとに保存する (§7.2)
export type RunRecord = {
  milestone: string | null;
  step: string; // build・gametest・e2e・code_review など
  startedAt: string;
  finishedAt: string;
  success: boolean;
  failure: string | null;
  logDir: string;
};

let sequence = 0;

// 実行 1 回分の記録ディレクトリを runs/ 配下に確保してパスを返す。名前の時刻と連番で実行順に並ぶ (§7.2)
export async function allocateRunDir(root: string, milestone: string | null, step: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(projectPaths(root).runs, `${stamp}-${String(++sequence).padStart(3, '0')}-${milestone ?? 'project'}-${step}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// 実行記録を logDir の record.json として保存する
export async function writeRunRecord(record: RunRecord): Promise<void> {
  await writeAtomic(path.join(record.logDir, 'record.json'), record);
}

// 記録ディレクトリを確保して action を実行し、成否を RunRecord として保存する
export async function recordRun<T>(root: string, milestone: string | null, step: string, action: (logDir: string) => Promise<T>): Promise<T> {
  const logDir = await allocateRunDir(root, milestone, step);
  const startedAt = new Date().toISOString();
  const record = (success: boolean, failure: string | null): Promise<void> =>
    writeRunRecord({ milestone, step, startedAt, finishedAt: new Date().toISOString(), success, failure, logDir });
  try {
    const result = await action(logDir);
    await record(true, null);
    return result;
  } catch (error) {
    await record(false, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

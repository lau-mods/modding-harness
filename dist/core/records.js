import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeAtomic } from './fs.js';
import { projectPaths } from './paths.js';
let sequence = 0;
// 実行 1 回分の記録ディレクトリを確保してパスを返す
export async function allocateRunDir(root, operation, milestone, attempt) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(projectPaths(root).runs, `${stamp}-${String(++sequence).padStart(3, '0')}-${milestone ?? 'project'}-${operation}-${attempt}`);
    await mkdir(dir, { recursive: true });
    return dir;
}
// 実行記録を logDir の record.json として保存する
export async function writeRecord(record) {
    await writeAtomic(path.join(record.logDir, 'record.json'), record);
}
// 記録ディレクトリを確保して action を実行し、成否を実行記録として保存する (§29)
export async function recordExecution(root, operation, milestone, attempt, action) {
    const logDir = await allocateRunDir(root, operation, milestone, attempt);
    const startedAt = new Date().toISOString();
    const record = (success, failure) => writeRecord({ operation, milestone, attempt, startedAt, finishedAt: new Date().toISOString(), success, failure, logDir });
    try {
        const result = await action(logDir);
        await record(true, null);
        return result;
    }
    catch (error) {
        await record(false, error instanceof Error ? error.message : String(error));
        throw error;
    }
}
//# sourceMappingURL=records.js.map
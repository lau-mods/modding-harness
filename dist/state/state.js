import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { FatalError } from '../core/errors.js';
import { exists, readJson, writeAtomic } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
// 未実行 project の初期状態を返す
export function initialState() {
    return { phase: 'idle', planLocked: false, currentMilestone: null, checkpoints: [], milestone: null, retry: null, rollbacks: [], fatal: null };
}
// 状態を読む。存在しなければ初期状態、読めなければ FatalError (§20)
export async function loadState(root) {
    const file = projectPaths(root).state;
    if (!await exists(file))
        return initialState();
    try {
        return await readJson(file);
    }
    catch (error) {
        throw new FatalError(`Cannot read harness state: ${error.message}`);
    }
}
// 状態を保存する
export async function saveState(root, state) {
    await writeAtomic(projectPaths(root).state, state);
}
// milestone 開始時 (rollback 後の再開を含む) の runtime state を作る
export function newMilestoneRuntime(milestone, baseCommit) {
    return { milestone, baseCommit, iteration: 0, buildFailure: null, codeReview: null, visualReview: null, e2e: null, e2eFailure: null, scenario: null, passedScenarios: [] };
}
// 計画が固定中であれば計画・仕様の変更を拒否する (§6, §23)
export function assertPlanMutable(state) {
    if (state.planLocked)
        throw new Error('The plan is fixed until harness develop completes; finish development before changing the plan or specification');
}
// 同一 project で Harness が多重実行されないよう排他して action を実行する
export async function withLock(root, action) {
    const file = projectPaths(root).lock;
    await mkdir(path.dirname(file), { recursive: true });
    let handle;
    try {
        handle = await open(file, 'wx');
    }
    catch {
        throw new Error(`Another harness process holds ${path.relative(root, file)}; remove it when that process has ended`);
    }
    try {
        await handle.writeFile(String(process.pid));
        return await action();
    }
    finally {
        await handle.close();
        await unlink(file);
    }
}
//# sourceMappingURL=state.js.map
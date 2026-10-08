import { loadConfig } from '../config/config.js';
import { assertIntegrity, captureBaseline } from '../core/integrity.js';
import { run } from '../core/process.js';
import { recordExecution } from '../core/records.js';
import { withRetry } from '../core/retry.js';
import { readProject } from '../spec/parser.js';
import { loadState, saveState } from '../state/state.js';
// config / PROJECT.md / state を読み込み、変更禁止対象の fingerprint を記録する。読めなければ FatalError (§20)
export async function openContext(root, runner = run) {
    const config = await loadConfig(root);
    const spec = await readProject(root);
    const state = await loadState(root);
    return { root, config, spec, state, runner, baseline: await captureBaseline(root) };
}
// phase を更新して state を保存し、進行状況を表示する (§24)
export async function enterPhase(ctx, phase) {
    ctx.state.phase = phase;
    await saveState(ctx.root, ctx.state);
    process.stderr.write(`[harness] ${phase}${ctx.state.currentMilestone ? ` ${ctx.state.currentMilestone}` : ''}\n`);
}
// Harness 本体と PROJECT.md が変更されていないことを確認する。agent 呼び出しなど各工程の前後で呼ぶ (§8, §20)
export async function guardIntegrity(ctx) {
    await assertIntegrity(ctx.root, ctx.baseline);
}
// Codex (implementation) または Claude (review・計画・仕様変更) 用の AgentCall を作る
export function agentCall(ctx, agent, logDir) {
    return { config: ctx.config.agents[agent], root: ctx.root, logDir, runner: ctx.runner };
}
// 外部実行を再試行規則付きで行い、各回を実行記録に残して再試行状況を state に反映する (§17, §29)
export async function retrying(ctx, operation, action) {
    const milestone = ctx.state.currentMilestone;
    const result = await withRetry(operation, attempt => recordExecution(ctx.root, operation, milestone, attempt, action), {
        onAttempt: async (attempt) => {
            ctx.state.retry = { operation, attempt };
            await saveState(ctx.root, ctx.state);
        },
    });
    ctx.state.retry = null;
    await saveState(ctx.root, ctx.state);
    return result;
}
//# sourceMappingURL=context.js.map
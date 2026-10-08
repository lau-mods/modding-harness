import { FatalError, toFatal } from '../core/errors.js';
import { run } from '../core/process.js';
import { isClean } from '../git/git.js';
import { checkPlan, loadPlan, nextMilestone } from '../plan/plan.js';
import { activeCriteria, requireActionable } from '../spec/check.js';
import { saveState, withLock } from '../state/state.js';
import { enterPhase, openContext } from '../workflow/context.js';
import { runMilestone } from '../workflow/milestone.js';
import { createPlan } from './plan.js';
import { preflight } from './preflight.js';
// 実機環境を preflight で確認し、全 milestone を順に checkpoint まで進め、complete または fatal に到達するまで継続する (§7, §22, §31)
export async function developProject(root, runner = run) {
    return withLock(root, async () => {
        const ctx = await openContext(root, runner);
        try {
            requireActionable(ctx.spec);
            await requireIgnoredState(ctx);
            if (!ctx.state.milestone && !await isClean(root))
                throw new FatalError('Commit local changes before harness develop; each milestone starts from a clean checkpoint');
            await enterPhase(ctx, 'preflight');
            await preflight(root, runner);
            const plan = await ensurePlan(ctx);
            ctx.state.planLocked = true;
            ctx.state.fatal = null;
            await saveState(root, ctx.state);
            for (let milestone = nextMilestone(plan, ctx.state.checkpoints); milestone; milestone = nextMilestone(plan, ctx.state.checkpoints)) {
                await runMilestone(ctx, milestone);
            }
            await completeProject(ctx, plan);
            return ctx.state.phase;
        }
        catch (error) {
            const fatal = toFatal(error);
            await recordFatal(ctx, fatal);
            throw fatal;
        }
    });
}
// 保存済み計画を使い、無いか PROJECT.md と対応しなければ新しく作る。固定中の計画はそのまま使う (§6)
export async function ensurePlan(ctx) {
    const plan = await loadPlan(ctx.root);
    if (ctx.state.planLocked) {
        if (!plan)
            throw new FatalError('The fixed implementation plan is missing');
        if (plan.specHash !== ctx.spec.hash)
            throw new FatalError('PROJECT.md differs from the fixed plan; restore PROJECT.md to continue development');
        return plan;
    }
    if (plan && !checkPlan(plan, ctx.spec).length)
        return plan;
    return createPlan(ctx);
}
// complete の条件 (計画で除外した AC を除く全 active AC の checkpoint) を満たすか確認し、満たせば phase を complete にして計画の固定を解除する (§22)
export async function completeProject(ctx, plan) {
    const done = new Set(ctx.state.checkpoints.map(checkpoint => checkpoint.milestone));
    const covered = new Set([...ctx.state.checkpoints.flatMap(checkpoint => checkpoint.acIds), ...plan.excluded.map(item => item.acId)]);
    const missing = [
        ...plan.milestones.filter(milestone => !done.has(milestone.id)).map(milestone => milestone.id),
        ...activeCriteria(ctx.spec).filter(criterion => !covered.has(criterion.id)).map(criterion => criterion.id),
    ];
    if (missing.length)
        throw new FatalError(`Development ended with incomplete items: ${missing.join(', ')}`);
    Object.assign(ctx.state, { planLocked: false, currentMilestone: null, milestone: null, retry: null });
    await enterPhase(ctx, 'complete');
}
// fatal の原因を state に記録して phase を fatal にする (§20)
export async function recordFatal(ctx, error) {
    ctx.state.fatal = { reason: error.message, at: new Date().toISOString() };
    await enterPhase(ctx, 'fatal');
}
// checkpoint commit に状態ファイルが入らないよう、.harness-state が gitignore 対象であることを確認する
async function requireIgnoredState(ctx) {
    const result = await run('git', ['check-ignore', '-q', '.harness-state/state.json'], { cwd: ctx.root });
    if (result.code !== 0)
        throw new FatalError('Add .harness-state/ to .gitignore (harness init does this)');
}
//# sourceMappingURL=develop.js.map
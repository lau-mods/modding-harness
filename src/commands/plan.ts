import { proposePlan } from '../agents/claude.js';
import { ExecutionFailure } from '../core/errors.js';
import { run } from '../core/process.js';
import type { Runner } from '../core/process.js';
import { commitFile, git } from '../git/git.js';
import { checkPlan, savePlan } from '../plan/plan.js';
import type { Plan } from '../plan/plan.js';
import { activeCriteria, requireActionable } from '../spec/check.js';
import { assertPlanMutable, withLock } from '../state/state.js';
import { agentCall, enterPhase, openContext, retrying } from '../workflow/context.js';
import type { WorkflowContext } from '../workflow/context.js';

// PROJECT.md を検査し、active AC を milestone に割り当てた計画を作成・保存する (§6)
export async function planProject(root: string, runner: Runner = run): Promise<Plan> {
  return withLock(root, async () => {
    const ctx = await openContext(root, runner);
    assertPlanMutable(ctx.state);
    requireActionable(ctx.spec);
    return createPlan(ctx);
  });
}

// 計画作成の本体。Claude の計画案を検証して保存・commit し、前の計画の進捗を初期化する。chat / develop からも呼ぶ (§6, §23)
export async function createPlan(ctx: WorkflowContext): Promise<Plan> {
  await enterPhase(ctx, 'planning');
  const input = {
    projectMarkdown: ctx.spec.text,
    criteria: activeCriteria(ctx.spec),
    projectFiles: (await git(ctx.root, ['ls-files'])).split('\n').filter(Boolean),
  };
  const plan = await retrying(ctx, 'plan', async logDir => {
    const proposal = await proposePlan(agentCall(ctx, 'review', logDir), input);
    const candidate: Plan = { specHash: ctx.spec.hash, createdAt: new Date().toISOString(), milestones: proposal.milestones, excluded: proposal.excluded };
    const problems = checkPlan(candidate, ctx.spec);
    if (problems.length) throw new ExecutionFailure(`Claude proposed an invalid plan: ${problems.join('; ')}`);
    return candidate;
  });
  await savePlan(ctx.root, plan);
  await commitFile(ctx.root, '.harness-plan.json', `plan: ${plan.milestones.map(milestone => milestone.id).join(', ')}`);
  Object.assign(ctx.state, { checkpoints: [], milestone: null, currentMilestone: null, retry: null });
  await enterPhase(ctx, 'idle');
  return plan;
}

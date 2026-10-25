import { e2eFor, gameTestsFor, loadAcceptance } from '../acceptance/acceptance.js';
import { FatalError, toFatal } from '../core/errors.js';
import { withLock } from '../core/lock.js';
import type { Runner } from '../core/process.js';
import { findCheckpoint, harnessSubmoduleReady, head, isClean } from '../git/git.js';
import { checkPlan, nextMilestone } from '../plan/plan.js';
import { allCriteria, checkActiveConditions, checkSpec } from '../spec/check.js';
import type { OverallStatus } from '../state/progress.js';
import { openContext, saveContext } from '../workflow/context.js';
import type { WorkflowContext } from '../workflow/context.js';
import { runMilestone } from '../workflow/milestone.js';
import { doctor } from './doctor.js';

// 開始条件を確認し、全 milestone を依存順に checkpoint まで進め、complete または fatal で終了する (§10, §24)
export async function developProject(root: string, runner: Runner): Promise<OverallStatus> {
  return withLock(root, async () => {
    const ctx = await openContext(root, runner);
    if (!nextMilestone(ctx.plan, ctx.progress.completed)) {
      await completeProject(ctx);
      return ctx.progress.status;
    }
    // 開始条件の不成立では作業ツリーを変更しないよう、progress に fatal を記録せずに終了する
    await checkStartConditions(ctx);
    try {
      ctx.progress.status = 'running';
      ctx.progress.fatal = null;
      await saveContext(ctx);
      for (let milestone = nextMilestone(ctx.plan, ctx.progress.completed); milestone; milestone = nextMilestone(ctx.plan, ctx.progress.completed)) {
        await runMilestone(ctx, milestone);
      }
      await completeProject(ctx);
      return ctx.progress.status;
    } catch (error) {
      const fatal = toFatal(error);
      await recordFatal(ctx, fatal);
      throw fatal;
    }
  });
}

// active な仕様・確定した plan・clean な作業ツリー・submodule・agent・Gradle・E2E 環境を確認する。不成立は FatalError (§10.1)
export async function checkStartConditions(ctx: WorkflowContext): Promise<void> {
  const problems: string[] = [];
  if (ctx.spec.status !== 'active') problems.push('PROJECT.md Status must be active');
  problems.push(...checkSpec(ctx.spec), ...checkActiveConditions(ctx.spec), ...checkPlan(ctx.plan, ctx.spec));
  if (!await isClean(ctx.root)) problems.push('The Git working tree must be clean; commit or discard local changes');
  if (!await harnessSubmoduleReady(ctx.root)) problems.push('The .harness submodule must be checked out at the recorded revision without local changes');
  for (const item of await doctor(ctx.root, ctx.runner)) {
    if (item.status !== 'ok') problems.push(`${item.name} is ${item.status}: ${item.detail.split('\n')[0]}`);
  }
  if (problems.length) throw new FatalError(`harness develop cannot start:\n- ${problems.join('\n- ')}`);
}

// プロジェクト全体の完成条件を確認する。complete の progress は最終 checkpoint に含まれている (§24)
export async function completeProject(ctx: WorkflowContext): Promise<void> {
  const problems: string[] = [];
  const incomplete = ctx.plan.milestones.filter(milestone => !ctx.progress.completed.includes(milestone.id));
  if (incomplete.length) problems.push(`Milestones are not completed: ${incomplete.map(milestone => milestone.id).join(', ')}`);
  const assigned = new Set(ctx.plan.milestones.flatMap(milestone => milestone.features));
  const unplanned = ctx.spec.features.filter(feature => !assigned.has(feature.id));
  if (unplanned.length) problems.push(`Features are not in the plan: ${unplanned.map(feature => feature.id).join(', ')}`);
  const acceptance = await loadAcceptance(ctx.root);
  const unverified = allCriteria(ctx.spec).filter(criterion => !gameTestsFor(acceptance, [criterion.id]).length && !e2eFor(acceptance, [criterion.id]).length);
  if (unverified.length) problems.push(`Acceptance Criteria have no GameTest or E2E: ${unverified.map(criterion => criterion.id).join(', ')}`);
  if (ctx.progress.status !== 'complete') problems.push(`progress.json status is ${ctx.progress.status}, not complete`);
  const last = ctx.progress.completed.at(-1);
  if (!last || await findCheckpoint(ctx.root, last) !== await head(ctx.root)) problems.push('The final checkpoint must be the Git HEAD');
  if (!await isClean(ctx.root)) problems.push('The Git working tree must be clean');
  if (problems.length) throw new FatalError(`The project does not meet the completion conditions:\n- ${problems.join('\n- ')}`);
  process.stderr.write('[harness] complete\n');
}

// fatal の原因と発生工程を progress に記録する (§23)
export async function recordFatal(ctx: WorkflowContext, error: FatalError): Promise<void> {
  ctx.progress.fatal = { phase: ctx.progress.phase, reason: error.message, at: new Date().toISOString() };
  ctx.progress.status = 'fatal';
  ctx.progress.phase = 'fatal';
  await saveContext(ctx);
}

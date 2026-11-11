import path from 'node:path';
import { e2eFor, gameTestsFor, loadAcceptance } from '../acceptance/acceptance.js';
import { FatalError, toFatal } from '../core/errors.js';
import { exists } from '../core/fs.js';
import { withLock } from '../core/lock.js';
import { PROGRESS_FILE, worktreeDir } from '../core/paths.js';
import type { Runner } from '../core/process.js';
import { addWorktree, findCheckpoint, harnessSubmoduleReady, head, isAncestor, isClean, moveChanges } from '../git/git.js';
import { checkPlan, readyMilestones } from '../plan/plan.js';
import type { Milestone } from '../plan/plan.js';
import { allCriteria, checkActiveConditions, checkSpec } from '../spec/check.js';
import type { MilestoneProgress, OverallStatus } from '../state/progress.js';
import { openContext, saveContext } from '../workflow/context.js';
import type { MilestoneContext, WorkflowContext } from '../workflow/context.js';
import { resumeMilestone, runMilestone, startMilestone } from '../workflow/milestone.js';
import { doctor } from './doctor.js';

// 並列に進めていた milestone の 1 つで発生した fatal error。他の milestone は中断する (§10.3, §23)
class MilestoneFatal extends FatalError {
  constructor(readonly milestone: string, cause: FatalError) {
    super(`${milestone}: ${cause.message}`, { cause });
  }
}

// 開始条件を確認し、依存先が完成した milestone を並列に checkpoint まで進め、complete または fatal で終了する (§10, §24)
export async function developProject(root: string, runner: Runner): Promise<OverallStatus> {
  return withLock(root, async () => {
    // 1 つの milestone が fatal になったら、他の milestone で実行中の agent・Gradle・runtime の process を止める
    const controller = new AbortController();
    const ctx = await openContext(root, (command, args, options) => runner(command, args, { ...options, signal: controller.signal }));
    if (!remainingMilestones(ctx).length) {
      await completeProject(ctx);
      return ctx.progress.status;
    }
    // 開始条件の不成立では作業ツリーを変更しないよう、progress に fatal を記録せずに終了する
    await checkStartConditions(ctx);
    try {
      ctx.progress.status = 'running';
      ctx.progress.fatal = null;
      await saveContext(ctx);
      await runMilestones(ctx, controller);
      await completeProject(ctx);
      return ctx.progress.status;
    } catch (error) {
      const fatal = toFatal(error);
      await recordFatal(ctx, fatal);
      throw fatal;
    }
  });
}

// 中断した milestone を再開し、依存先がすべて完成した milestone を config.parallel 件まで並列に進める。
// checkpoint のたびに新たに ready になった milestone を始め、fatal error が起きたら他を中断して投げる (§10.2, §10.3)
export async function runMilestones(ctx: WorkflowContext, controller: AbortController): Promise<void> {
  const running = new Map<string, Promise<void>>();
  const failures: MilestoneFatal[] = [];
  const launch = (milestone: Milestone, open: () => Promise<MilestoneContext>): void => {
    const task = open().then(runMilestone).catch((error: unknown) => {
      if (failures.length) return; // 先に fatal になった milestone による中断
      failures.push(new MilestoneFatal(milestone.id, toFatal(error)));
      controller.abort(new FatalError(`Stopped because ${milestone.id} failed`));
    }).finally(() => running.delete(milestone.id));
    running.set(milestone.id, task);
  };
  for (const current of [...ctx.progress.active]) {
    const milestone = findMilestone(ctx, current.id);
    launch(milestone, () => reopenMilestone(ctx, milestone, current));
  }
  for (;;) {
    if (!failures.length) {
      const ready = readyMilestones(ctx.plan, ctx.progress.completed, [...running.keys()]);
      for (const milestone of ready.slice(0, Math.max(0, ctx.config.parallel - running.size))) launch(milestone, () => startMilestone(ctx, milestone));
    }
    if (!running.size) break;
    await Promise.race(running.values());
  }
  if (failures.length) throw failures[0];
  if (remainingMilestones(ctx).length) throw new FatalError(`No milestone can start: ${remainingMilestones(ctx).map(milestone => milestone.id).join(', ')}`);
}

// 中断した milestone の worktree があれば再開する。旧形式の progress で Workspace に残る途中の変更は worktree へ移して再開し、どちらも無ければ最初から始める (§10.1)
async function reopenMilestone(ctx: WorkflowContext, milestone: Milestone, current: MilestoneProgress): Promise<MilestoneContext> {
  const dir = worktreeDir(ctx.root, milestone.id);
  if (await exists(dir)) return resumeMilestone(ctx, milestone);
  if (!await isClean(ctx.root, '.', `:(exclude)${PROGRESS_FILE}`)) {
    await addWorktree(ctx.root, dir, current.baseCommit);
    await moveChanges(ctx.root, dir, PROGRESS_FILE);
    return resumeMilestone(ctx, milestone);
  }
  return startMilestone(ctx, milestone, current.recoveries);
}

// active な仕様・確定した plan・clean な作業ツリー・submodule・agent・Gradle・E2E 環境を確認する。不成立は FatalError (§10.1)
export async function checkStartConditions(ctx: WorkflowContext): Promise<void> {
  const problems: string[] = [];
  if (ctx.spec.status !== 'active') problems.push('PROJECT.md Status must be active');
  problems.push(...checkSpec(ctx.spec), ...checkActiveConditions(ctx.spec), ...checkPlan(ctx.plan, ctx.spec));
  const fixed = ['PROJECT.md', '.harness-state/plan.json'];
  const workspace = await head(ctx.root);
  // fatal や中断で止まった milestone は、worktree の変更とレビュー状態を引き継いで Codex implementation から再開する
  const missing: MilestoneProgress[] = [];
  for (const current of ctx.progress.active) {
    const dir = worktreeDir(ctx.root, current.id);
    if (!ctx.plan.milestones.some(milestone => milestone.id === current.id)) problems.push(`progress.json has an unknown milestone in progress: ${current.id}`);
    else if (!await exists(dir)) missing.push(current);
    else {
      if (await head(dir) !== current.baseCommit) problems.push(`HEAD of ${path.relative(ctx.root, dir)} must stay at ${current.baseCommit}, the restore point of ${current.id}, to resume it`);
      if (!await isClean(dir, ...fixed)) problems.push(`PROJECT.md and plan.json in ${path.relative(ctx.root, dir)} must match its HEAD to resume ${current.id}`);
      if (!await isAncestor(ctx.root, current.baseCommit, workspace)) problems.push(`HEAD must contain ${current.baseCommit}, the restore point of ${current.id}, to resume it`);
    }
  }
  // Workspace の作業ツリーには progress.json 以外の変更を置かない。旧形式で 1 つの milestone の途中の変更が残る場合だけ、worktree へ移して再開する
  const legacy = missing.length === 1 && ctx.progress.active.length === 1 && missing[0]!.baseCommit === workspace;
  if (legacy) {
    if (!await isClean(ctx.root, ...fixed)) problems.push('PROJECT.md and plan.json must match HEAD to resume; restore them, or restore the last checkpoint to restart the milestone');
  } else if (!await isClean(ctx.root, '.', `:(exclude)${PROGRESS_FILE}`)) problems.push('The Git working tree must be clean; commit or discard local changes');
  if (!await harnessSubmoduleReady(ctx.root)) problems.push('The .harness submodule must be checked out at the recorded revision without local changes');
  for (const item of await doctor(ctx.root, ctx.runner)) {
    if (item.status !== 'ok') problems.push(`${item.name} is ${item.status}: ${item.detail.split('\n')[0]}`);
  }
  if (problems.length) throw new FatalError(`develop cannot start:\n- ${problems.join('\n- ')}`);
}

// プロジェクト全体の完成条件を確認する。complete の progress は最終 checkpoint に含まれている (§24)
export async function completeProject(ctx: WorkflowContext): Promise<void> {
  const problems: string[] = [];
  const incomplete = remainingMilestones(ctx);
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

// fatal の原因と発生した milestone・工程を progress に記録する (§23)
export async function recordFatal(ctx: WorkflowContext, error: FatalError): Promise<void> {
  const milestone = error instanceof MilestoneFatal ? error.milestone : null;
  // checkpoint の途中で失敗した milestone は active から外れている
  const phase = ctx.progress.active.find(item => item.id === milestone)?.phase ?? (milestone ? 'checkpoint' : 'idle');
  ctx.progress.fatal = { milestone, phase, reason: error.message, at: new Date().toISOString() };
  ctx.progress.status = 'fatal';
  await saveContext(ctx);
}

// 完成していない milestone
function remainingMilestones(ctx: WorkflowContext): Milestone[] {
  return ctx.plan.milestones.filter(milestone => !ctx.progress.completed.includes(milestone.id));
}

function findMilestone(ctx: WorkflowContext, id: string): Milestone {
  const milestone = ctx.plan.milestones.find(item => item.id === id);
  if (!milestone) throw new FatalError(`progress.json has an unknown milestone in progress: ${id}`);
  return milestone;
}

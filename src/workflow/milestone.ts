import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { checkAcceptance, checkMilestoneCoverage, e2eFor, gameTestsFor, loadAcceptance } from '../acceptance/acceptance.js';
import type { AgentCall } from '../agents/agent.js';
import { recheckCode, recheckE2E, reviewCode, reviewConflicts, reviewE2E } from '../agents/claude.js';
import type { CodeReviewInput, E2EReviewInput } from '../agents/claude.js';
import { implement } from '../agents/codex.js';
import { compileAndBuild, findModJar } from '../build/gradle.js';
import { ExecutionFailure } from '../core/errors.js';
import { exists } from '../core/fs.js';
import { PROGRESS_FILE, worktreeDir } from '../core/paths.js';
import { recordRun } from '../core/runs.js';
import { e2eFailure, runE2E } from '../e2e/e2e.js';
import type { E2ERunSummary } from '../e2e/e2e.js';
import { resetRuntime } from '../e2e/runtime.js';
import { gameTestFailure, runGameTests } from '../gametest/gametest.js';
import {
  addWorktree, applyWorktree, createCheckpoint, diffFrom, discardChanges, head, mergeIntoWorktree, removeWorktree, restoreCheckpoint, revertLicenseFiles, snapshotTree,
} from '../git/git.js';
import { milestoneCriteria, milestoneFeatures } from '../plan/plan.js';
import type { Milestone } from '../plan/plan.js';
import { addFindings, applyResponses, applyVerdicts, createIssueSet, isSettled, openIssues } from '../review/issues.js';
import type { IssueKind, IssueSet, IssueVerdict, ReviewFinding, ReviewIssue } from '../review/issues.js';
import { newMilestoneProgress } from '../state/progress.js';
import { agentCall, currentMilestone, enterPhase, guardIntegrity, replaceMilestone, saveContext } from './context.js';
import type { MilestoneContext, WorkflowContext } from './context.js';
import { attempt, RecoveryRequired } from './retry.js';

// 統合で Workspace の新しい checkpoint を取り込んだ結果。checkpoint なら milestone は完成した (§10.3)
type Integration = 'checkpoint' | 'merged' | 'conflict';

// milestone を始める。Workspace の HEAD (直前 checkpoint) から worktree を作り、途中進捗を active に加える (§10.3)
export async function startMilestone(ctx: WorkflowContext, milestone: Milestone, recoveries = 0): Promise<MilestoneContext> {
  const dir = worktreeDir(ctx.root, milestone.id);
  const base = await head(ctx.root);
  await addWorktree(ctx.root, dir, base);
  ctx.progress.active = [...ctx.progress.active.filter(item => item.id !== milestone.id), newMilestoneProgress(milestone.id, base, recoveries)];
  await saveContext(ctx);
  return { ...ctx, milestone, dir };
}

// 中断した milestone の worktree を、作業途中の変更とレビュー状態を引き継いで再開する (§10.1)
export function resumeMilestone(ctx: WorkflowContext, milestone: Milestone): MilestoneContext {
  return { ...ctx, milestone, dir: worktreeDir(ctx.root, milestone.id) };
}

// milestone を checkpoint まで進める。RecoveryRequired なら復元して同じ milestone を最初から再実行する (§10.2, §20.4)
export async function runMilestone(ctx: MilestoneContext): Promise<void> {
  for (;;) {
    try {
      return await attemptMilestone(ctx);
    } catch (error) {
      if (!(error instanceof RecoveryRequired)) throw error;
      await recoverMilestone(ctx, error);
    }
  }
}

// recovery を挟まない milestone 1 周分の実行。工程が失敗・未解決なら Codex 修正から関連工程を再実行する。
// 検証が済んだら統合し、他の milestone の checkpoint を取り込んだ場合は衝突の解消 (Codex) または build から検証し直す (§10.2, §10.3, §18)
export async function attemptMilestone(ctx: MilestoneContext): Promise<void> {
  let implement = true;
  for (;;) {
    if (implement) await implementationStep(ctx);
    implement = true;
    if (!await buildStep(ctx)) continue;
    if (!await codeReviewStep(ctx)) continue;
    if (!await gameTestStep(ctx)) continue;
    const summary = await e2eStep(ctx);
    if (!summary) continue;
    if (!await e2eReviewStep(ctx, summary)) continue;
    const integration = await integrateStep(ctx);
    if (integration === 'checkpoint') return;
    implement = integration === 'conflict';
  }
}

// Codex に実装または修正を依頼し、指摘への accepted 応答を指摘集合へ反映する (§11, §14.2, §17.2)
export async function implementationStep(ctx: MilestoneContext): Promise<void> {
  const { milestone } = ctx;
  await enterPhase(ctx, 'implementation');
  const current = currentMilestone(ctx);
  const input = {
    projectMarkdown: ctx.spec.text,
    milestone,
    features: milestoneFeatures(ctx.spec, milestone),
    criteria: milestoneCriteria(ctx.spec, milestone),
    relatedFiles: milestone.scope,
    failure: current.failure,
    codeIssues: openIssues(current.codeReview),
    e2eIssues: openIssues(current.e2eReview),
  };
  const retry = Boolean(input.failure || input.codeIssues.length || input.e2eIssues.length);
  const output = await recordRun(ctx.root, milestone.id, 'implementation', logDir => implement(agentCall(ctx, 'implementation', logDir, retry), input));
  await revertLicenseFiles(ctx.dir);
  // worktree の progress.json は使わないため、Codex が変更しても統合に持ち込まない
  await discardChanges(ctx.dir, PROGRESS_FILE);
  await guardIntegrity(ctx);
  if (current.codeReview) current.codeReview = applyResponses(current.codeReview, output.responses);
  if (current.e2eReview) current.e2eReview = applyResponses(current.e2eReview, output.responses);
  await saveContext(ctx);
}

// 統合で衝突したファイルに conflict marker が残っていないことを確かめてから、compile → build を実行する。成功なら true (§10.3, §13)
export async function buildStep(ctx: MilestoneContext): Promise<boolean> {
  await enterPhase(ctx, 'build');
  const current = currentMilestone(ctx);
  const built = await attempt(ctx, 'build', async logDir => {
    const marked = [];
    for (const file of current.conflicts) {
      const full = path.join(ctx.dir, file);
      if (await exists(full) && /^(<{7}|>{7}) /m.test(await readFile(full, 'utf8'))) marked.push(file);
    }
    if (marked.length) throw new ExecutionFailure('Merge conflict markers remain', `Resolve the conflicts in:\n${marked.join('\n')}`);
    await compileAndBuild(ctx.dir, ctx.config.gradle, logDir, ctx.runner);
  }) !== null;
  if (built && current.conflicts.length) {
    current.conflicts = [];
    // 解消済みの衝突を以降の Codex 修正へ渡さない
    if (current.failure?.phase === 'integration') current.failure = null;
    await saveContext(ctx);
  }
  return built;
}

// 初回は復元基点からの差分で指摘集合を固定する。以降は前回レビューからの差分で固定済み指摘の状態だけを更新し、差分が無ければ判定を引き継ぐ。
// 統合の衝突を解消した後は、解消の差分を初回レビューして指摘を集合に加える。全指摘が resolved / accepted なら true (§14, §14.3)
export async function codeReviewStep(ctx: MilestoneContext): Promise<boolean> {
  const { milestone } = ctx;
  await enterPhase(ctx, 'code_review');
  const current = currentMilestone(ctx);
  const tree = await snapshotTree(ctx.dir);
  // resolved の指摘の再発は前回レビュー以降の変更からしか起きないため、再確認はその差分で判定する
  const diff = await diffFrom(ctx.dir, current.codeReview ? current.codeReviewTree ?? current.baseCommit : current.baseCommit);
  // modify/delete の衝突は merge 結果のまま解消でき差分が出ないことがあるため、衝突解消のレビューが残っていれば省略しない
  if (current.codeReview && !diff && !current.reviewConflicts.length) return isSettled(current.codeReview);
  const input: CodeReviewInput = { milestone, criteria: milestoneCriteria(ctx.spec, milestone), diff };
  current.codeReview = await review(ctx, 'code', current.codeReview,
    call => reviewCode(call, input),
    (call, issues) => recheckCode(call, input, issues));
  if (current.reviewConflicts.length) {
    const conflictInput = { ...input, conflicts: current.reviewConflicts };
    const findings = await recordRun(ctx.root, milestone.id, 'conflict_review', logDir => reviewConflicts(agentCall(ctx, 'codeReview', logDir), conflictInput));
    current.codeReview = addFindings(current.codeReview, findings);
    current.reviewConflicts = [];
  }
  current.codeReviewTree = tree;
  await saveContext(ctx);
  return isSettled(current.codeReview);
}

// 対象 AC の対応表を確認し、GameTest を実行して report を照合する。全件成功なら true (§15)
export async function gameTestStep(ctx: MilestoneContext): Promise<boolean> {
  const { milestone } = ctx;
  await enterPhase(ctx, 'gametest');
  const criteria = milestoneCriteria(ctx.spec, milestone);
  return await attempt(ctx, 'gametest', async logDir => {
    const map = await loadAcceptance(ctx.dir);
    const problems = [...await checkAcceptance(ctx.dir, map, ctx.spec), ...checkMilestoneCoverage(map, ctx.spec, milestone)];
    if (problems.length) throw new ExecutionFailure('tests/acceptance.json does not cover the milestone correctly', problems.join('\n'));
    const mappings = gameTestsFor(map, criteria.map(criterion => criterion.id));
    if (!mappings.length) return;
    const result = await runGameTests(ctx.dir, ctx.config.gradle, mappings, logDir, ctx.runner);
    if (!result.success) throw gameTestFailure(result, criteria);
  }) !== null;
}

// 描画 AC を含む milestone で E2E scenario を実行する。runtime は 1 組なので他の milestone の E2E の終了を待つ。対象外なら空の結果、実行失敗なら null (§10.2, §10.3, §16)
export async function e2eStep(ctx: MilestoneContext): Promise<E2ERunSummary | null> {
  const criteria = milestoneCriteria(ctx.spec, ctx.milestone);
  const mappings = e2eFor(await loadAcceptance(ctx.dir), criteria.map(criterion => criterion.id));
  if (!mappings.length) return { scenarios: [], logs: [], logDir: '' };
  await enterPhase(ctx, 'e2e');
  return ctx.runtimeLock.run(() => attempt(ctx, 'e2e', async logDir => {
    const summary = await runE2E(ctx.root, ctx.dir, ctx.config.runtime, mappings, await findModJar(ctx.dir), logDir, ctx.runner);
    if (summary.scenarios.some(scenario => !scenario.success)) throw e2eFailure(summary, criteria);
    return summary;
  }));
}

// 初回は指摘集合を固定し、以降は固定済み指摘の状態だけを更新する。全指摘が resolved / accepted なら true (§17)
export async function e2eReviewStep(ctx: MilestoneContext, summary: E2ERunSummary): Promise<boolean> {
  const { milestone } = ctx;
  const current = currentMilestone(ctx);
  if (!summary.scenarios.length) return current.e2eReview ? isSettled(current.e2eReview) : true;
  const input: E2EReviewInput = { milestone, criteria: milestoneCriteria(ctx.spec, milestone), scenarios: summary.scenarios };
  current.e2eReview = await review(ctx, 'e2e', current.e2eReview,
    call => reviewE2E(call, input),
    (call, issues) => recheckE2E(call, input, issues));
  await saveContext(ctx);
  return isSettled(current.e2eReview);
}

// 検証が済んだ worktree を Workspace へ統合する。Workspace の HEAD が復元基点のままなら checkpoint を作る。
// 並列に進んだ他の milestone の checkpoint で HEAD が進んでいれば、それを worktree へ取り込んで復元基点を進め、検証をやり直させる (§10.3)
export async function integrateStep(ctx: MilestoneContext): Promise<Integration> {
  return ctx.checkpointLock.run(async () => {
    const current = currentMilestone(ctx);
    const latest = await head(ctx.root);
    if (latest === current.baseCommit) {
      await checkpointStep(ctx);
      return 'checkpoint';
    }
    await enterPhase(ctx, 'integration');
    const conflicts = await mergeIntoWorktree(ctx.dir, latest);
    process.stderr.write(`[harness] ${current.id} merged ${latest}${conflicts.length ? ` with ${conflicts.length} conflict(s)` : ''}\n`);
    current.baseCommit = latest;
    // 取り込んだ他の milestone の変更はレビュー済みのため、Code Review には conflict marker を含む merge 直後からの変更 (衝突の解消) だけを渡す
    current.codeReviewTree = await snapshotTree(ctx.dir);
    current.conflicts = conflicts;
    current.reviewConflicts = [...new Set([...current.reviewConflicts, ...conflicts])];
    if (conflicts.length) {
      current.failure = {
        phase: 'integration',
        summary: `Merging the latest checkpoint into ${current.id} left conflicts in ${conflicts.length} file(s)`,
        details: [
          'Milestones without mutual dependencies were implemented in parallel, and another one has been completed since this milestone started.',
          'Resolve every conflict so that the completed milestones and this milestone both keep working: the "HEAD" side of each marker is this milestone, the other side is the latest checkpoint.',
          'Remove all conflict markers.',
          '',
          ...conflicts,
        ].join('\n'),
        logs: [],
        screenshots: [],
      };
    }
    await saveContext(ctx);
    return conflicts.length ? 'conflict' : 'merged';
  });
}

// worktree の変更と完成状態の progress を Workspace へ取り込んで checkpoint commit を作り、worktree を削除する。全 milestone が完成すれば complete の progress を含める (§21, §24)
export async function checkpointStep(ctx: MilestoneContext): Promise<void> {
  const { milestone } = ctx;
  await enterPhase(ctx, 'checkpoint');
  await guardIntegrity(ctx);
  await discardChanges(ctx.dir, PROGRESS_FILE);
  await applyWorktree(ctx.root, ctx.dir);
  ctx.progress.completed.push(milestone.id);
  ctx.progress.active = ctx.progress.active.filter(item => item.id !== milestone.id);
  if (ctx.plan.milestones.every(item => ctx.progress.completed.includes(item.id))) ctx.progress.status = 'complete';
  await saveContext(ctx);
  const acIds = milestoneCriteria(ctx.spec, milestone).map(criterion => criterion.id);
  ctx.progress.lastCheckpoint = await createCheckpoint(ctx.root, milestone, acIds);
  await removeWorktree(ctx.root, ctx.dir);
  process.stderr.write(`[harness] ${milestone.id} checkpoint ${ctx.progress.lastCheckpoint}\n`);
}

// 現在 milestone の変更を破棄して復元基点へ戻し、途中進捗・指摘集合・runtime 状態・build artifact を初期化する (§20.2, §20.3)
export async function recoverMilestone(ctx: MilestoneContext, cause: RecoveryRequired): Promise<void> {
  await enterPhase(ctx, 'recovery');
  const current = currentMilestone(ctx);
  process.stderr.write(`[harness] ${current.id} recovery to ${current.baseCommit}: ${cause.message}\n`);
  // 他の milestone が E2E で runtime を使っている間は止めない
  await ctx.runtimeLock.run(() => resetRuntime(ctx.root, ctx.config.runtime));
  await restoreCheckpoint(ctx.dir, current.baseCommit);
  await rm(path.join(ctx.dir, 'build', 'libs'), { recursive: true, force: true });
  replaceMilestone(ctx, newMilestoneProgress(current.id, current.baseCommit, current.recoveries + 1));
  await saveContext(ctx);
  await guardIntegrity(ctx);
}

// 初回レビューなら指摘集合を作って固定し、以降は accepted 以外の固定済み指摘を再判定して再発も検出する (§14, §17, §18)
async function review(
  ctx: MilestoneContext, kind: IssueKind, set: IssueSet | null,
  initial: (call: AgentCall) => Promise<ReviewFinding[]>,
  recheck: (call: AgentCall, issues: ReviewIssue[]) => Promise<IssueVerdict[]>,
): Promise<IssueSet> {
  const id = ctx.milestone.id;
  if (!set) {
    const findings = await recordRun(ctx.root, id, `${kind}_review`, logDir => initial(agentCall(ctx, `${kind}Review`, logDir)));
    return createIssueSet(kind, findings);
  }
  const targets = set.issues.filter(issue => issue.status !== 'accepted');
  if (!targets.length) return set;
  const verdicts = await recordRun(ctx.root, id, `${kind}_recheck`, logDir => recheck(agentCall(ctx, `${kind}Review`, logDir, true), targets));
  return applyVerdicts(set, verdicts);
}

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { checkAcceptance, checkMilestoneCoverage, e2eFor, gameTestsFor, loadAcceptance } from '../acceptance/acceptance.js';
import type { AgentCall } from '../agents/agent.js';
import { recheckCode, recheckE2E, reviewCode, reviewE2E } from '../agents/claude.js';
import type { CodeReviewInput, E2EReviewInput } from '../agents/claude.js';
import { implement } from '../agents/codex.js';
import { compileAndBuild, findModJar } from '../build/gradle.js';
import { ExecutionFailure } from '../core/errors.js';
import { recordRun } from '../core/runs.js';
import { e2eFailure, runE2E } from '../e2e/e2e.js';
import type { E2ERunSummary } from '../e2e/e2e.js';
import { resetRuntime } from '../e2e/runtime.js';
import { gameTestFailure, runGameTests } from '../gametest/gametest.js';
import { changedFilesFrom, createCheckpoint, diffFrom, head, restoreCheckpoint } from '../git/git.js';
import { milestoneCriteria, milestoneFeatures, nextMilestone } from '../plan/plan.js';
import type { Milestone } from '../plan/plan.js';
import { applyResponses, applyVerdicts, createIssueSet, isSettled, openIssues } from '../review/issues.js';
import type { IssueKind, IssueSet, IssueVerdict, ReviewFinding, ReviewIssue } from '../review/issues.js';
import { newMilestoneProgress } from '../state/progress.js';
import { agentCall, currentMilestone, enterPhase, guardIntegrity, saveContext } from './context.js';
import type { WorkflowContext } from './context.js';
import { attempt, RecoveryRequired } from './retry.js';

// milestone を checkpoint まで進める。RecoveryRequired なら復元して同じ milestone を最初から再実行する (§10.2, §20.4)
export async function runMilestone(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  for (;;) {
    try {
      return await attemptMilestone(ctx, milestone);
    } catch (error) {
      if (!(error instanceof RecoveryRequired)) throw error;
      await recoverMilestone(ctx, milestone, error);
    }
  }
}

// recovery を挟まない milestone 1 周分の実行。工程が失敗・未解決なら Codex 修正から関連工程を再実行する (§10.2, §18)
export async function attemptMilestone(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  if (ctx.progress.current?.id !== milestone.id) {
    const base = await head(ctx.root);
    ctx.progress.current = newMilestoneProgress(milestone.id, base, 0);
    ctx.progress.lastCheckpoint = base;
  }
  ctx.failure = null;
  for (;;) {
    await implementationStep(ctx, milestone);
    if (!await buildStep(ctx)) continue;
    if (!await codeReviewStep(ctx, milestone)) continue;
    if (!await gameTestStep(ctx, milestone)) continue;
    const summary = await e2eStep(ctx, milestone);
    if (!summary) continue;
    if (!await e2eReviewStep(ctx, milestone, summary)) continue;
    return checkpointStep(ctx, milestone);
  }
}

// Codex に実装または修正を依頼し、指摘への accepted 応答を指摘集合へ反映する (§11, §14.2, §17.2)
export async function implementationStep(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  await enterPhase(ctx, 'implementation');
  const current = currentMilestone(ctx);
  const input = {
    projectMarkdown: ctx.spec.text,
    milestone,
    features: milestoneFeatures(ctx.spec, milestone),
    criteria: milestoneCriteria(ctx.spec, milestone),
    relatedFiles: milestone.scope,
    failure: ctx.failure,
    codeIssues: openIssues(current.codeReview),
    e2eIssues: openIssues(current.e2eReview),
  };
  const output = await recordRun(ctx.root, milestone.id, 'implementation', logDir => implement(agentCall(ctx, 'implementation', logDir), input));
  await guardIntegrity(ctx);
  if (current.codeReview) current.codeReview = applyResponses(current.codeReview, output.responses);
  if (current.e2eReview) current.e2eReview = applyResponses(current.e2eReview, output.responses);
  ctx.failure = null;
  await saveContext(ctx);
}

// compile → build を実行する。成功なら true (§13)
export async function buildStep(ctx: WorkflowContext): Promise<boolean> {
  await enterPhase(ctx, 'build');
  return await attempt(ctx, 'build', logDir => compileAndBuild(ctx.root, ctx.config.gradle, logDir, ctx.runner)) !== null;
}

// 初回は指摘集合を固定し、以降は固定済み指摘の状態だけを更新する。全指摘が resolved / accepted なら true (§14)
export async function codeReviewStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  await enterPhase(ctx, 'code_review');
  const current = currentMilestone(ctx);
  const input = async (): Promise<CodeReviewInput> => ({
    milestone,
    criteria: milestoneCriteria(ctx.spec, milestone),
    diff: await diffFrom(ctx.root, current.baseCommit),
    changedFiles: await changedFilesFrom(ctx.root, current.baseCommit),
  });
  current.codeReview = await review(ctx, milestone, 'code', current.codeReview,
    async call => reviewCode(call, await input()),
    async (call, issues) => recheckCode(call, await input(), issues));
  await saveContext(ctx);
  return isSettled(current.codeReview);
}

// 対象 AC の対応表を確認し、GameTest を実行して report を照合する。全件成功なら true (§15)
export async function gameTestStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  await enterPhase(ctx, 'gametest');
  const criteria = milestoneCriteria(ctx.spec, milestone);
  return await attempt(ctx, 'gametest', async logDir => {
    const map = await loadAcceptance(ctx.root);
    const problems = [...await checkAcceptance(ctx.root, map, ctx.spec), ...checkMilestoneCoverage(map, ctx.spec, milestone)];
    if (problems.length) throw new ExecutionFailure('tests/acceptance.json does not cover the milestone correctly', problems.join('\n'));
    const mappings = gameTestsFor(map, criteria.map(criterion => criterion.id));
    if (!mappings.length) return;
    const result = await runGameTests(ctx.root, ctx.config.gradle, mappings, logDir, ctx.runner);
    if (!result.success) throw gameTestFailure(result, criteria);
  }) !== null;
}

// 描画 AC を含む milestone で E2E scenario を実行する。対象外なら空の結果、実行失敗なら null (§10.2, §16)
export async function e2eStep(ctx: WorkflowContext, milestone: Milestone): Promise<E2ERunSummary | null> {
  const criteria = milestoneCriteria(ctx.spec, milestone);
  const mappings = e2eFor(await loadAcceptance(ctx.root), criteria.map(criterion => criterion.id));
  if (!mappings.length) return { scenarios: [], logs: [], logDir: '' };
  await enterPhase(ctx, 'e2e');
  return attempt(ctx, 'e2e', async logDir => {
    const summary = await runE2E(ctx.root, ctx.config.runtime, mappings, await findModJar(ctx.root), logDir, ctx.runner);
    if (summary.scenarios.some(scenario => !scenario.success)) throw e2eFailure(summary, criteria);
    return summary;
  });
}

// 初回は指摘集合を固定し、以降は固定済み指摘の状態だけを更新する。全指摘が resolved / accepted なら true (§17)
export async function e2eReviewStep(ctx: WorkflowContext, milestone: Milestone, summary: E2ERunSummary): Promise<boolean> {
  const current = currentMilestone(ctx);
  if (!summary.scenarios.length) return current.e2eReview ? isSettled(current.e2eReview) : true;
  const input: E2EReviewInput = { milestone, criteria: milestoneCriteria(ctx.spec, milestone), scenarios: summary.scenarios };
  current.e2eReview = await review(ctx, milestone, 'e2e', current.e2eReview,
    call => reviewE2E(call, input),
    (call, issues) => recheckE2E(call, input, issues));
  await saveContext(ctx);
  return isSettled(current.e2eReview);
}

// 完成状態の progress を含む checkpoint commit を作る。最終 milestone では complete の progress を含める (§21, §24)
export async function checkpointStep(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  await enterPhase(ctx, 'checkpoint');
  await guardIntegrity(ctx);
  ctx.progress.completed.push(milestone.id);
  ctx.progress.current = null;
  if (!nextMilestone(ctx.plan, ctx.progress.completed)) {
    ctx.progress.status = 'complete';
    ctx.progress.phase = 'complete';
  }
  await saveContext(ctx);
  const acIds = milestoneCriteria(ctx.spec, milestone).map(criterion => criterion.id);
  ctx.progress.lastCheckpoint = await createCheckpoint(ctx.root, milestone, acIds);
  process.stderr.write(`[harness] ${milestone.id} checkpoint ${ctx.progress.lastCheckpoint}\n`);
}

// 現在 milestone の変更を破棄して直前 checkpoint へ復元し、途中進捗・指摘集合・runtime 状態・build artifact を初期化する (§20.2, §20.3)
export async function recoverMilestone(ctx: WorkflowContext, milestone: Milestone, cause: RecoveryRequired): Promise<void> {
  await enterPhase(ctx, 'recovery');
  const current = currentMilestone(ctx);
  process.stderr.write(`[harness] ${milestone.id} recovery to ${current.baseCommit}: ${cause.message}\n`);
  await resetRuntime(ctx.root, ctx.config.runtime);
  await restoreCheckpoint(ctx.root, current.baseCommit);
  await rm(path.join(ctx.root, 'build', 'libs'), { recursive: true, force: true });
  // 復元で progress.json も checkpoint 時点に戻るため、recovery 回数を引き継いだ途中進捗を保存し直す
  ctx.progress.current = newMilestoneProgress(milestone.id, current.baseCommit, current.recoveries + 1);
  ctx.failure = null;
  await saveContext(ctx);
  await guardIntegrity(ctx);
}

// 初回レビューなら指摘集合を作って固定し、以降は accepted 以外の固定済み指摘を再判定して再発も検出する (§14, §17, §18)
async function review(
  ctx: WorkflowContext, milestone: Milestone, kind: IssueKind, set: IssueSet | null,
  initial: (call: AgentCall) => Promise<ReviewFinding[]>,
  recheck: (call: AgentCall, issues: ReviewIssue[]) => Promise<IssueVerdict[]>,
): Promise<IssueSet> {
  if (!set) {
    const findings = await recordRun(ctx.root, milestone.id, `${kind}_review`, logDir => initial(agentCall(ctx, 'review', logDir)));
    return createIssueSet(kind, findings);
  }
  const targets = set.issues.filter(issue => issue.status !== 'accepted');
  if (!targets.length) return set;
  const verdicts = await recordRun(ctx.root, milestone.id, `${kind}_recheck`, logDir => recheck(agentCall(ctx, 'review', logDir), targets));
  return applyVerdicts(set, verdicts);
}

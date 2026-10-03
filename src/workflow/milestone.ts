import type { AgentCall, AgentResult } from '../agents/agent.js';
import { recheckCode, recheckVisual, reviewCode, reviewVisual } from '../agents/claude.js';
import type { CodeReviewInput, VisualReviewInput } from '../agents/claude.js';
import { implement } from '../agents/codex.js';
import { compileAndBuild } from '../build/gradle.js';
import { RetryExhausted } from '../core/errors.js';
import { allocateRunDir, writeRecord } from '../core/records.js';
import { failureReport, needsVisualReview, runE2E } from '../e2e/e2e.js';
import type { E2ERunSummary } from '../e2e/e2e.js';
import { changedFilesFrom, createCheckpoint, diffFrom, head, restoreCommit } from '../git/git.js';
import type { Milestone } from '../plan/plan.js';
import { applyResponses, applyVerdicts, createIssueSet, isSettled, pendingIssues } from '../review/issues.js';
import type { IssueKind, IssueSet, IssueVerdict, ReviewFinding } from '../review/issues.js';
import { findCriterion } from '../spec/check.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import { newMilestoneRuntime, saveState } from '../state/state.js';
import type { CheckpointRecord, MilestoneRuntime } from '../state/state.js';
import { agentCall, enterPhase, guardIntegrity, retrying } from './context.js';
import type { WorkflowContext } from './context.js';

// milestone を checkpoint まで進める。RetryExhausted なら rollback して同じ milestone を最初から再実行する (§18)
export async function runMilestone(ctx: WorkflowContext, milestone: Milestone): Promise<CheckpointRecord> {
  for (;;) {
    try {
      return await attemptMilestone(ctx, milestone);
    } catch (error) {
      if (!(error instanceof RetryExhausted)) throw error;
      await rollbackMilestone(ctx, milestone, error);
    }
  }
}

// rollback を挟まない milestone 1 周分の実行。§30 の状態遷移に従って工程を繰り返す
export async function attemptMilestone(ctx: WorkflowContext, milestone: Milestone): Promise<CheckpointRecord> {
  ctx.state.currentMilestone = milestone.id;
  if (ctx.state.milestone?.milestone !== milestone.id) ctx.state.milestone = newMilestoneRuntime(milestone.id, await head(ctx.root));
  await saveState(ctx.root, ctx.state);
  for (;;) {
    await implementationStep(ctx, milestone);
    if (!await buildStep(ctx, milestone)) continue;
    if (!await codeReviewStep(ctx, milestone)) continue;
    const e2e = await e2eStep(ctx, milestone);
    if (!e2e.passed) continue;
    if (!await visualReviewStep(ctx, milestone, e2e)) continue;
    return checkpointStep(ctx, milestone);
  }
}

// Codex に実装・修正を依頼し、指摘への accepted 応答を指摘集合へ反映する (§8, §11)
export async function implementationStep(ctx: WorkflowContext, milestone: Milestone): Promise<void> {
  await enterPhase(ctx, 'implementation');
  const runtime = current(ctx);
  runtime.iteration++;
  const input = {
    milestone,
    criteria: criteriaOf(ctx, milestone),
    projectMarkdown: ctx.spec.text,
    relatedFiles: milestone.scope,
    buildFailure: runtime.buildFailure,
    codeIssues: pendingIssues(runtime.codeReview),
    visualIssues: pendingIssues(runtime.visualReview),
    e2eFailure: runtime.e2eFailure,
  };
  const output = await retrying(ctx, 'implementation', logDir => implement(agentCall(ctx, 'implementation', logDir), input));
  await guardIntegrity(ctx);
  if (runtime.codeReview) runtime.codeReview = applyResponses(runtime.codeReview, output.responses);
  if (runtime.visualReview) runtime.visualReview = applyResponses(runtime.visualReview, output.responses);
  runtime.buildFailure = null;
  runtime.e2eFailure = null;
  await saveState(ctx.root, ctx.state);
}

// compile → build を実行する。失敗時は結果を Codex 差し戻し用に保存して false を返す (§9)
export async function buildStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  await enterPhase(ctx, 'build');
  const runtime = current(ctx);
  const logDir = await allocateRunDir(ctx.root, 'build', milestone.id, runtime.iteration);
  const startedAt = new Date().toISOString();
  const result = await compileAndBuild(ctx.root, ctx.config, logDir, ctx.runner);
  await writeRecord({ operation: 'build', milestone: milestone.id, attempt: runtime.iteration, startedAt, finishedAt: new Date().toISOString(), success: result.success, failure: result.success ? null : `${result.step} failed`, logDir });
  runtime.buildFailure = result.success ? null : result;
  await saveState(ctx.root, ctx.state);
  return result.success;
}

// 初回は指摘集合を固定し、以降は初回指摘だけを再確認する。全指摘が解決済みなら true (§10, §11)
export async function codeReviewStep(ctx: WorkflowContext, milestone: Milestone): Promise<boolean> {
  await enterPhase(ctx, 'code_review');
  const runtime = current(ctx);
  if (runtime.codeReview && isSettled(runtime.codeReview)) return true;
  const changedFiles = await changedFilesFrom(ctx.root, runtime.baseCommit);
  const input: CodeReviewInput = {
    milestone,
    criteria: criteriaOf(ctx, milestone),
    diff: await diffFrom(ctx.root, runtime.baseCommit),
    changedFiles,
    scenarioFiles: changedFiles.filter(file => file.startsWith('tests/e2e/')),
  };
  runtime.codeReview = await review(ctx, 'code', milestone, runtime.codeReview,
    call => reviewCode(call, input),
    (call, set) => recheckCode(call, input, pendingIssues(set), set.sessionId));
  await saveState(ctx.root, ctx.state);
  return isSettled(runtime.codeReview);
}

// 実機 E2E を再試行規則付きで実行して結果を記録する。assertion failure は Codex 差し戻し用に保存する (§12, §19)
export async function e2eStep(ctx: WorkflowContext, milestone: Milestone): Promise<E2ERunSummary> {
  await enterPhase(ctx, 'e2e');
  const runtime = current(ctx);
  const criteria = criteriaOf(ctx, milestone);
  const summary = await retrying(ctx, 'e2e', logDir => runE2E(ctx.root, ctx.config, criteria, logDir, ctx.runner, {
    onScenario: async scenarioId => {
      runtime.scenario = scenarioId;
      await saveState(ctx.root, ctx.state);
    },
  }));
  runtime.scenario = null;
  runtime.e2e = summary;
  runtime.e2eFailure = summary.passed ? null : failureReport(summary, criteria);
  await saveState(ctx.root, ctx.state);
  return summary;
}

// screenshot がある場合に画面確認を行う。初回は指摘集合を固定し、以降は再確認のみ。全指摘が解決済みなら true (§15, §16)
export async function visualReviewStep(ctx: WorkflowContext, milestone: Milestone, e2e: E2ERunSummary): Promise<boolean> {
  const runtime = current(ctx);
  if (runtime.visualReview && isSettled(runtime.visualReview)) return true;
  // 画面指摘の再確認には screenshot が必要なため、screenshot の無い回は修正工程へ戻す
  if (!needsVisualReview(e2e)) return runtime.visualReview === null;
  await enterPhase(ctx, 'visual_review');
  const input: VisualReviewInput = { milestone, criteria: criteriaOf(ctx, milestone), screenshots: e2e.screenshots, results: e2e.runs.map(run => run.result) };
  runtime.visualReview = await review(ctx, 'visual', milestone, runtime.visualReview,
    call => reviewVisual(call, input),
    (call, set) => recheckVisual(call, input, pendingIssues(set), set.sessionId));
  await saveState(ctx.root, ctx.state);
  return isSettled(runtime.visualReview);
}

// checkpoint commit を作成して state に記録する (§21)
export async function checkpointStep(ctx: WorkflowContext, milestone: Milestone): Promise<CheckpointRecord> {
  await enterPhase(ctx, 'checkpoint');
  const commit = await createCheckpoint(ctx.root, milestone.id, milestone.acIds);
  const record: CheckpointRecord = { milestone: milestone.id, commit, acIds: milestone.acIds, createdAt: new Date().toISOString() };
  ctx.state.checkpoints.push(record);
  ctx.state.milestone = null;
  ctx.state.currentMilestone = null;
  await saveState(ctx.root, ctx.state);
  return record;
}

// 作業ツリーを直前 checkpoint へ復元し、指摘集合・review session・E2E 結果を含む milestone の runtime state を初期化して rollback 履歴を残す (§18)
export async function rollbackMilestone(ctx: WorkflowContext, milestone: Milestone, failure: RetryExhausted): Promise<void> {
  await enterPhase(ctx, 'rollback');
  const base = ctx.state.milestone?.baseCommit ?? await head(ctx.root);
  await restoreCommit(ctx.root, base);
  ctx.state.rollbacks.push({ milestone: milestone.id, operation: failure.operation, reason: failure.lastFailure.message, restoredTo: base, at: new Date().toISOString() });
  ctx.state.milestone = newMilestoneRuntime(milestone.id, base);
  ctx.state.retry = null;
  await saveState(ctx.root, ctx.state);
}

// 初回レビューなら指摘集合を作って固定し、2 回目以降は未解決指摘の判定だけを反映する (§10, §15)
async function review(
  ctx: WorkflowContext, kind: IssueKind, milestone: Milestone, set: IssueSet | null,
  initial: (call: AgentCall) => Promise<AgentResult<ReviewFinding[]>>,
  recheck: (call: AgentCall, set: IssueSet) => Promise<AgentResult<IssueVerdict[]>>,
): Promise<IssueSet> {
  const operation = `${kind}_review`;
  if (!set) {
    const result = await retrying(ctx, operation, logDir => initial(agentCall(ctx, 'review', logDir)));
    return createIssueSet(kind, milestone.id, result.output, result.sessionId);
  }
  const result = await retrying(ctx, operation, logDir => recheck(agentCall(ctx, 'review', logDir), set));
  return { ...applyVerdicts(set, result.output), sessionId: result.sessionId };
}

function current(ctx: WorkflowContext): MilestoneRuntime {
  return ctx.state.milestone!;
}

function criteriaOf(ctx: WorkflowContext, milestone: Milestone): AcceptanceCriterion[] {
  return milestone.acIds.map(id => findCriterion(ctx.spec, id)).filter((criterion): criterion is AcceptanceCriterion => criterion !== undefined);
}

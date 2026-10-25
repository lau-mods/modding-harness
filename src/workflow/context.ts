import type { AgentCall } from '../agents/agent.js';
import { loadConfig } from '../config/config.js';
import type { HarnessConfig } from '../config/config.js';
import { FatalError } from '../core/errors.js';
import type { FailureReport } from '../core/errors.js';
import { assertIntegrity, captureBaseline } from '../core/integrity.js';
import type { IntegrityBaseline } from '../core/integrity.js';
import type { Runner } from '../core/process.js';
import { loadPlan } from '../plan/plan.js';
import type { Plan } from '../plan/plan.js';
import { readProject } from '../spec/parser.js';
import type { ProjectSpec } from '../spec/types.js';
import { loadProgress, saveProgress } from '../state/progress.js';
import type { MilestoneProgress, Phase, Progress } from '../state/progress.js';

// develop の各工程で共有する読み込み済みの設定・仕様・plan・progress
export type WorkflowContext = {
  root: string;
  config: HarnessConfig;
  spec: ProjectSpec;
  plan: Plan;
  progress: Progress;
  runner: Runner;
  baseline: IntegrityBaseline; // 開始時の Harness 本体・PROJECT.md・plan の fingerprint
  failure: FailureReport | null; // 次の Codex 修正へ渡す直前の実行失敗
};

// config / PROJECT.md / plan / progress を読み込み、固定対象の fingerprint を記録する。読めなければ FatalError (§6.3, §23)
export async function openContext(root: string, runner: Runner): Promise<WorkflowContext> {
  const config = await loadConfig(root);
  const spec = await readProject(root);
  const plan = await loadPlan(root);
  const progress = await loadProgress(root);
  if (!plan || !progress) throw new FatalError('The milestone plan is not fixed; run harness plan first');
  return { root, config, spec, plan, progress, runner, baseline: await captureBaseline(root), failure: null };
}

// 現在の工程を更新して progress を保存し、進行状況を表示する (§7.1, §22)
export async function enterPhase(ctx: WorkflowContext, phase: Phase): Promise<void> {
  ctx.progress.phase = phase;
  await saveContext(ctx);
  process.stderr.write(`[harness] ${ctx.progress.current ? `${ctx.progress.current.id} ` : ''}${phase}\n`);
}

// progress を保存する
export async function saveContext(ctx: WorkflowContext): Promise<void> {
  await saveProgress(ctx.root, ctx.progress);
}

// Harness 本体・PROJECT.md・plan が変更されていないことを確認する。agent 呼び出しの後などに呼ぶ (§4.2, §11, §23)
export async function guardIntegrity(ctx: WorkflowContext): Promise<void> {
  await assertIntegrity(ctx.root, ctx.baseline);
}

// Codex (implementation) または Claude (review) 用の AgentCall を作る
export function agentCall(ctx: WorkflowContext, agent: 'implementation' | 'review', logDir: string): AgentCall {
  return { config: ctx.config.agents[agent], root: ctx.root, logDir, runner: ctx.runner };
}

// 進行中 milestone の途中進捗を返す
export function currentMilestone(ctx: WorkflowContext): MilestoneProgress {
  if (!ctx.progress.current) throw new FatalError('No milestone is in progress');
  return ctx.progress.current;
}

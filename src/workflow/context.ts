import type { AgentCall } from '../agents/agent.js';
import { loadConfig } from '../config/config.js';
import type { AgentConfig, CodexConfig, HarnessConfig } from '../config/config.js';
import { FatalError } from '../core/errors.js';
import { assertIntegrity, captureBaseline } from '../core/integrity.js';
import type { IntegrityBaseline } from '../core/integrity.js';
import { Mutex } from '../core/mutex.js';
import { cliCommand, projectPaths } from '../core/paths.js';
import type { Runner } from '../core/process.js';
import { loadPlan } from '../plan/plan.js';
import type { Milestone, Plan } from '../plan/plan.js';
import { readProject } from '../spec/parser.js';
import type { ProjectSpec } from '../spec/types.js';
import { loadProgress, saveProgress } from '../state/progress.js';
import type { MilestoneProgress, Phase, Progress } from '../state/progress.js';

// develop の各工程で共有する読み込み済みの設定・仕様・plan・progress。root は Workspace で、progress と実行記録はここに置く
export type WorkflowContext = {
  root: string;
  config: HarnessConfig;
  spec: ProjectSpec;
  plan: Plan;
  progress: Progress;
  runner: Runner;
  baseline: IntegrityBaseline; // 開始時の Harness 本体・PROJECT.md・plan の fingerprint
  runtimeLock: Mutex; // Minecraft runtime は 1 組しか無いため、E2E と runtime の初期化を 1 つずつ行う (§10.3)
  checkpointLock: Mutex; // Workspace の HEAD の確認から checkpoint 作成までを 1 つずつ行う (§10.3)
};

// 並列に進む milestone 1 件分の実行環境。dir はその milestone 専用の git worktree で、実装・build・テスト・レビューはここで行う (§10.3)
export type MilestoneContext = WorkflowContext & { milestone: Milestone; dir: string };

// develop で繰り返し実行する agent ごとの、1 回分の呼び出し設定
type RepeatedCalls = { implementation: CodexConfig; codeReview: AgentConfig; e2eReview: AgentConfig };

// config / PROJECT.md / plan / progress を読み込み、固定対象の fingerprint を記録する。読めなければ FatalError (§6.3, §23)
export async function openContext(root: string, runner: Runner): Promise<WorkflowContext> {
  const config = await loadConfig(root);
  const spec = await readProject(root);
  const plan = await loadPlan(root);
  const progress = await loadProgress(root);
  if (!plan || !progress) throw new FatalError(`The milestone plan is not fixed; run ${cliCommand()} plan first`);
  return { root, config, spec, plan, progress, runner, baseline: await captureBaseline(root), runtimeLock: new Mutex(), checkpointLock: new Mutex() };
}

// milestone の現在の工程を更新して progress を保存し、進行状況を表示する (§7.1, §22)
export async function enterPhase(ctx: MilestoneContext, phase: Phase): Promise<void> {
  const current = currentMilestone(ctx);
  current.phase = phase;
  await saveContext(ctx);
  process.stderr.write(`[harness] ${current.id} ${phase}\n`);
}

// progress を保存する
export async function saveContext(ctx: WorkflowContext): Promise<void> {
  await saveProgress(ctx.root, ctx.progress);
}

// Harness 本体と、Workspace・worktree の PROJECT.md・plan が変更されていないことを確認する。agent 呼び出しの後などに呼ぶ (§4.2, §11, §23)
export async function guardIntegrity(ctx: MilestoneContext): Promise<void> {
  for (const root of new Set([ctx.root, ctx.dir])) await assertIntegrity(root, ctx.baseline);
}

// 役割に対応する agent 設定で、milestone の worktree を作業ディレクトリにする AgentCall を作る。log と screenshot は Workspace の runs/ から読ませる。retry なら 2 回目以降の model / effort を使う (§8)
export function agentCall<K extends keyof RepeatedCalls>(ctx: MilestoneContext, agent: K, logDir: string, retry = false): AgentCall<RepeatedCalls[K]> {
  const config = ctx.config.agents[agent];
  return { config: { ...config, ...config[retry ? 'retry' : 'initial'] } as unknown as RepeatedCalls[K], root: ctx.dir, logDir, runner: ctx.runner, readDirs: [projectPaths(ctx.root).runs] };
}

// milestone の途中進捗を返す
export function currentMilestone(ctx: MilestoneContext): MilestoneProgress {
  const current = ctx.progress.active.find(item => item.id === ctx.milestone.id);
  if (!current) throw new FatalError(`${ctx.milestone.id} is not in progress`);
  return current;
}

// milestone の途中進捗を置き換える。recovery での初期化に使う (§20.3)
export function replaceMilestone(ctx: MilestoneContext, progress: MilestoneProgress): void {
  ctx.progress.active = ctx.progress.active.map(item => item.id === progress.id ? progress : item);
}

import type { AgentCall } from '../agents/agent.js';
import type { HarnessConfig } from '../config/config.js';
import type { IntegrityBaseline } from '../core/integrity.js';
import type { Runner } from '../core/process.js';
import type { ProjectSpec } from '../spec/types.js';
import type { HarnessState, Phase } from '../state/state.js';

// 開発処理で共有する読み込み済みの設定・仕様・状態
export type WorkflowContext = {
  root: string;
  config: HarnessConfig;
  spec: ProjectSpec;
  state: HarnessState;
  runner: Runner;
  baseline: IntegrityBaseline; // 開始時の Harness 本体と PROJECT.md の fingerprint
};

// config / PROJECT.md / state を読み込み、変更禁止対象の fingerprint を記録する。読めなければ FatalError (§20)
export async function openContext(root: string, runner?: Runner): Promise<WorkflowContext> {
  throw new Error('Not implemented');
}

// phase を更新して state を保存し、進行状況を表示する (§24)
export async function enterPhase(ctx: WorkflowContext, phase: Phase): Promise<void> {
  throw new Error('Not implemented');
}

// Harness 本体と PROJECT.md が変更されていないことを確認する。agent 呼び出しなど各工程の前後で呼ぶ (§8, §20)
export async function guardIntegrity(ctx: WorkflowContext): Promise<void> {
  throw new Error('Not implemented');
}

// Codex (implementation) または Claude (review・計画・仕様変更) 用の AgentCall を作る
export function agentCall(ctx: WorkflowContext, agent: 'implementation' | 'review', logDir: string): AgentCall {
  throw new Error('Not implemented');
}

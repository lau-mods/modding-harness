import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
import type { Plan } from '../plan/plan.js';
import type { ProjectSpec } from '../spec/types.js';
import type { HarnessState } from '../state/state.js';

// PROJECT.md を検査し、active AC を milestone に割り当てた計画を作成・保存する (§6)
export async function planProject(root: string, runner?: Runner): Promise<Plan> {
  throw new Error('Not implemented');
}

// 計画作成の本体。Claude の計画案を検証して保存する。chat / develop からも呼ぶ (§6, §23)
export async function createPlan(root: string, config: HarnessConfig, spec: ProjectSpec, state: HarnessState, runner: Runner): Promise<Plan> {
  throw new Error('Not implemented');
}

import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
import type { Plan } from '../plan/plan.js';
import type { ProjectSpec } from '../spec/types.js';

// active な PROJECT.md から plan を生成し、初期 progress と共に保存して commit で確定する (§6.2, §9)
export async function planProject(root: string, runner: Runner): Promise<Plan> {
  throw new Error('Not implemented');
}

// Claude に plan 案を作らせて検証する。不正な plan は FatalError (§6.2)
export async function createPlan(root: string, spec: ProjectSpec, config: HarnessConfig, runner: Runner): Promise<Plan> {
  throw new Error('Not implemented');
}

// plan.json と初期 progress.json を保存して commit する。初回 milestone の復元基点になる (§10.1, §20.2)
export async function commitPlan(root: string, plan: Plan, message: string): Promise<string> {
  throw new Error('Not implemented');
}

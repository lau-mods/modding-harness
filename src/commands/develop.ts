import type { FatalError } from '../core/errors.js';
import type { Runner } from '../core/process.js';
import type { Plan } from '../plan/plan.js';
import type { Phase } from '../state/state.js';
import type { WorkflowContext } from '../workflow/context.js';

// 全 milestone を順に checkpoint まで進め、complete または fatal に到達するまで継続する (§7, §22, §31)
export async function developProject(root: string, runner?: Runner): Promise<Phase> {
  throw new Error('Not implemented');
}

// 保存済み計画を使い、無いか PROJECT.md と対応しなければ新しく作る。固定中の計画は変更しない (§6)
export async function ensurePlan(ctx: WorkflowContext): Promise<Plan> {
  throw new Error('Not implemented');
}

// complete の条件を満たすか確認し、満たせば phase を complete にして計画の固定を解除する (§22)
export async function completeProject(ctx: WorkflowContext, plan: Plan): Promise<void> {
  throw new Error('Not implemented');
}

// fatal の原因を state に記録して phase を fatal にする (§20)
export async function recordFatal(ctx: WorkflowContext, error: FatalError): Promise<void> {
  throw new Error('Not implemented');
}

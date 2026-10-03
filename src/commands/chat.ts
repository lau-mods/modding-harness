import type { Runner } from '../core/process.js';
import type { Plan } from '../plan/plan.js';

// Claude に仕様変更要求を反映させて PROJECT.md を更新し、構造確認と commit の後に新しい計画を作る。開発実行中は拒否する (§23)
export async function chatProject(root: string, request: string, runner?: Runner): Promise<Plan> {
  throw new Error('Not implemented');
}

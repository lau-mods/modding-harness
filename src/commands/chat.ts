import type { Runner } from '../core/process.js';
import type { Plan } from '../plan/plan.js';

// 製品要求を PROJECT.md に反映して検証・commit し、active なら新しい plan と progress を確定する。develop 実行中は拒否する (§9.6)
export async function chatProject(root: string, request: string, runner: Runner): Promise<Plan | null> {
  throw new Error('Not implemented');
}

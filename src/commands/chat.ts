import { editSpec } from '../agents/claude.js';
import { ExecutionFailure } from '../core/errors.js';
import { writeAtomic } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
import { run } from '../core/process.js';
import type { Runner } from '../core/process.js';
import { commitFile } from '../git/git.js';
import type { Plan } from '../plan/plan.js';
import { checkActivation, checkStructure } from '../spec/check.js';
import { parseProject } from '../spec/parser.js';
import { assertPlanMutable, withLock } from '../state/state.js';
import { agentCall, enterPhase, openContext, retrying } from '../workflow/context.js';
import { createPlan } from './plan.js';

// Claude に仕様変更要求を反映させて PROJECT.md を更新し、構造確認と commit の後に新しい計画を作る。開発実行中は拒否する (§23)
// 更新後の仕様が active の条件を満たさない場合は計画を作らず null を返す
export async function chatProject(root: string, request: string, runner: Runner = run): Promise<Plan | null> {
  if (!request.trim()) throw new Error('harness chat requires a product change request');
  return withLock(root, async () => {
    const ctx = await openContext(root, runner);
    assertPlanMutable(ctx.state);
    const edit = await retrying(ctx, 'spec_edit', async logDir => {
      const output = await editSpec(agentCall(ctx, 'review', logDir), { request, projectMarkdown: ctx.spec.text });
      let spec;
      try { spec = parseProject(output.projectMarkdown); }
      catch (error) { throw new ExecutionFailure(`Claude returned an invalid PROJECT.md: ${(error as Error).message}`, 'spec_edit'); }
      const problems = checkStructure(spec);
      if (problems.length) throw new ExecutionFailure(`Claude returned an invalid PROJECT.md: ${problems.join('; ')}`, 'spec_edit');
      return { summary: output.summary, spec };
    });
    if (edit.spec.text !== ctx.spec.text) {
      await writeAtomic(projectPaths(root).spec, edit.spec.text);
      await commitFile(root, 'PROJECT.md', `spec: ${edit.summary.split('\n')[0]}`);
    }
    ctx.spec = edit.spec;
    if (edit.spec.status !== 'active' || checkActivation(edit.spec).length) {
      await enterPhase(ctx, 'idle');
      return null;
    }
    return createPlan(ctx);
  });
}

import path from 'node:path';
import { editSpec } from '../agents/claude.js';
import { loadConfig } from '../config/config.js';
import { FatalError } from '../core/errors.js';
import { writeAtomic } from '../core/fs.js';
import { withLock } from '../core/lock.js';
import { projectPaths } from '../core/paths.js';
import type { Runner } from '../core/process.js';
import { recordRun } from '../core/runs.js';
import { commitFiles } from '../git/git.js';
import type { Plan } from '../plan/plan.js';
import { checkActiveConditions, checkSpec } from '../spec/check.js';
import { parseProject, readProject } from '../spec/parser.js';
import { commitPlan, createPlan, requireIdle } from './plan.js';

// 製品要求を PROJECT.md に反映して検証・commit し、active なら新しい plan と progress を確定する。develop 実行中は拒否する (§9.6)
// 変更後の仕様が active の条件を満たさない場合は plan を作らず null を返す
export async function chatProject(root: string, request: string, runner: Runner): Promise<Plan | null> {
  if (!request.trim()) throw new Error('harness chat requires a product change request');
  return withLock(root, async () => {
    await requireIdle(root);
    const config = await loadConfig(root);
    const current = await readProject(root);
    const output = await recordRun(root, null, 'spec_edit', logDir =>
      editSpec({ config: config.agents.review, root, logDir, runner }, { request, projectMarkdown: current.text }));
    const spec = parseProject(output.projectMarkdown);
    const problems = checkSpec(spec);
    if (problems.length) throw new FatalError(`Claude returned an invalid PROJECT.md:\n- ${problems.join('\n- ')}`);
    const specFile = projectPaths(root).spec;
    await writeAtomic(specFile, spec.text);
    await commitFiles(root, [path.relative(root, specFile)], `Spec: ${output.summary.split('\n')[0]}`);
    if (spec.status !== 'active' || checkActiveConditions(spec).length) return null;
    const plan = await createPlan(root, spec, config, runner);
    await commitPlan(root, plan, `Harness plan: ${plan.milestones.map(milestone => milestone.id).join(', ')}`);
    return plan;
  });
}

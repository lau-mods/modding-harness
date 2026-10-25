import path from 'node:path';
import { proposePlan } from '../agents/claude.js';
import { loadConfig } from '../config/config.js';
import type { HarnessConfig } from '../config/config.js';
import { FatalError } from '../core/errors.js';
import { withLock } from '../core/lock.js';
import { projectPaths } from '../core/paths.js';
import type { Runner } from '../core/process.js';
import { recordRun } from '../core/runs.js';
import { commitFiles, git } from '../git/git.js';
import { checkPlan, savePlan } from '../plan/plan.js';
import type { Plan } from '../plan/plan.js';
import { checkActiveConditions, checkSpec } from '../spec/check.js';
import { readProject } from '../spec/parser.js';
import type { ProjectSpec } from '../spec/types.js';
import { initialProgress, loadProgress, saveProgress } from '../state/progress.js';

// active な PROJECT.md から plan を生成し、初期 progress と共に保存して commit で確定する (§6.2, §9)
export async function planProject(root: string, runner: Runner): Promise<Plan> {
  return withLock(root, async () => {
    await requireIdle(root);
    const spec = await readProject(root);
    requireActive(spec);
    const plan = await createPlan(root, spec, await loadConfig(root), runner);
    await commitPlan(root, plan, `Harness plan: ${plan.milestones.map(milestone => milestone.id).join(', ')}`);
    return plan;
  });
}

// Claude に plan 案を作らせて検証する。不正な plan は FatalError (§6.2)
export async function createPlan(root: string, spec: ProjectSpec, config: HarnessConfig, runner: Runner): Promise<Plan> {
  const input = {
    projectMarkdown: spec.text,
    features: spec.features,
    projectFiles: (await git(root, ['ls-files'])).split('\n').filter(Boolean),
  };
  const proposal = await recordRun(root, null, 'plan', logDir => proposePlan({ config: config.agents.review, root, logDir, runner }, input));
  const plan: Plan = { milestones: proposal.milestones };
  const problems = checkPlan(plan, spec);
  if (problems.length) throw new FatalError(`Claude proposed an invalid plan:\n- ${problems.join('\n- ')}`);
  return plan;
}

// plan.json と初期 progress.json を保存し、PROJECT.md と共に commit する。初回 milestone の復元基点になる (§10.1, §20.2)
export async function commitPlan(root: string, plan: Plan, message: string): Promise<string> {
  const paths = projectPaths(root);
  await savePlan(root, plan);
  await saveProgress(root, initialProgress());
  return commitFiles(root, [paths.spec, paths.plan, paths.progress].map(file => path.relative(root, file)), message);
}

// 仕様変更と plan の作成は develop の開始前または正常完了後に限る。milestone の途中進捗があれば拒否する (§6.3, §9.6)
export async function requireIdle(root: string): Promise<void> {
  const progress = await loadProgress(root);
  if (progress?.current) {
    throw new Error(`Milestone ${progress.current.id} is in progress; finish harness develop, or restore the last checkpoint, before changing the specification or plan`);
  }
}

// plan を作れる仕様 (active かつ問題なし) であることを確認する。違反時は FatalError (§5.2, §23)
export function requireActive(spec: ProjectSpec): void {
  if (spec.status !== 'active') throw new FatalError('PROJECT.md Status must be active before planning');
  const problems = [...checkSpec(spec), ...checkActiveConditions(spec)];
  if (problems.length) throw new FatalError(`PROJECT.md is incomplete:\n- ${problems.join('\n- ')}`);
}

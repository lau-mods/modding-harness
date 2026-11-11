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
import { checkPlan, loadPlan, savePlan } from '../plan/plan.js';
import type { Plan } from '../plan/plan.js';
import { checkActiveConditions, checkSpec } from '../spec/check.js';
import { readProject } from '../spec/parser.js';
import type { ProjectSpec } from '../spec/types.js';
import { initialProgress, loadProgress, saveProgress } from '../state/progress.js';

// active な PROJECT.md から plan を生成し、progress と共に保存して commit で確定する (§6.2, §9)
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

// Claude に plan 案を作らせて検証する。完成済み milestone があれば既存の plan に、plan に無い Feature の milestone を追記する。不正な plan は FatalError (§6.2, §9.6)
export async function createPlan(root: string, spec: ProjectSpec, config: HarnessConfig, runner: Runner): Promise<Plan> {
  const planned = (await loadProgress(root))?.completed.length ? (await loadPlan(root))?.milestones ?? [] : [];
  const assigned = new Set(planned.flatMap(milestone => milestone.features));
  const features = spec.features.filter(feature => !assigned.has(feature.id));
  if (planned.length && !features.length) return { milestones: planned };
  const input = {
    projectMarkdown: spec.text,
    features,
    projectFiles: (await git(root, ['ls-files'])).split('\n').filter(Boolean),
    planned,
  };
  const proposal = await recordRun(root, null, 'plan', logDir => proposePlan({ config: config.agents.plan, root, logDir, runner }, input));
  const plan: Plan = { milestones: [...planned, ...proposal.milestones] };
  const problems = checkPlan(plan, spec);
  if (problems.length) throw new FatalError(`Claude proposed an invalid plan:\n- ${problems.join('\n- ')}`);
  return plan;
}

// plan.json と、完成済み milestone を引き継いだ progress.json を保存し、PROJECT.md と共に commit する。次に開始する milestone の復元基点になる (§9.6, §10.1, §20.2)
export async function commitPlan(root: string, plan: Plan, message: string): Promise<string> {
  const paths = projectPaths(root);
  const previous = await loadProgress(root);
  await savePlan(root, plan);
  await saveProgress(root, { ...initialProgress(), completed: previous?.completed ?? [], lastCheckpoint: previous?.lastCheckpoint ?? null });
  return commitFiles(root, [paths.spec, paths.plan, paths.progress].map(file => path.relative(root, file)), message);
}

// 仕様変更と plan の作成は develop の開始前または正常完了後に限る。milestone の途中進捗があれば拒否する (§6.3, §9.6)
export async function requireIdle(root: string): Promise<void> {
  const progress = await loadProgress(root);
  if (progress?.active.length) {
    const ids = progress.active.map(item => item.id).join(', ');
    throw new Error(`Milestone ${ids} is in progress; finish develop, or restore the last checkpoint, before changing the specification or plan`);
  }
}

// plan を作れる仕様 (active かつ問題なし) であることを確認する。違反時は FatalError (§5.2, §23)
export function requireActive(spec: ProjectSpec): void {
  if (spec.status !== 'active') throw new FatalError('PROJECT.md Status must be active before planning');
  const problems = [...checkSpec(spec), ...checkActiveConditions(spec)];
  if (problems.length) throw new FatalError(`PROJECT.md is incomplete:\n- ${problems.join('\n- ')}`);
}

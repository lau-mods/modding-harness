import { checkAcceptance, checkMilestoneCoverage, loadAcceptance } from '../acceptance/acceptance.js';
import { loadConfig } from '../config/config.js';
import { commitExists, findCheckpoint } from '../git/git.js';
import { checkPlan, loadPlan } from '../plan/plan.js';
import type { Plan } from '../plan/plan.js';
import { checkActiveConditions, checkSpec } from '../spec/check.js';
import { readProject } from '../spec/parser.js';
import type { ProjectSpec } from '../spec/types.js';
import { loadProgress } from '../state/progress.js';
import type { Progress } from '../state/progress.js';

// validate の結果。spec は PROJECT.md を解釈できた場合だけ設定する (§9.4)
export type ValidationReport = { spec: ProjectSpec | null; problems: string[] };

// 仕様・設定・plan・GameTest / E2E の対応・progress を検査して問題を列挙する (§9.4)
export async function validateProject(root: string): Promise<ValidationReport> {
  const problems: string[] = [];
  const attempt = <T>(read: Promise<T>): Promise<T | null> => read.catch((error: Error) => { problems.push(error.message); return null; });
  await attempt(loadConfig(root));
  const spec = await attempt(readProject(root));
  const plan = await attempt(loadPlan(root));
  const acceptance = await attempt(loadAcceptance(root));
  const progress = await attempt(loadProgress(root));
  if (spec) {
    problems.push(...checkSpec(spec));
    if (spec.status === 'active') problems.push(...checkActiveConditions(spec));
    if (plan) problems.push(...checkPlan(plan, spec));
    if (acceptance) {
      problems.push(...await checkAcceptance(root, acceptance, spec));
      // 完成済み milestone の AC は GameTest または E2E で確認済みであること
      for (const milestone of plan?.milestones.filter(item => progress?.completed.includes(item.id)) ?? []) {
        problems.push(...checkMilestoneCoverage(acceptance, spec, milestone));
      }
    }
  }
  if (plan && progress) problems.push(...await checkProgress(root, progress, plan));
  return { spec, problems };
}

// progress の完成済み milestone・現在 milestone・checkpoint が plan と Git 履歴に整合するか検査する (§9.4)
export async function checkProgress(root: string, progress: Progress, plan: Plan): Promise<string[]> {
  const problems: string[] = [];
  const ids = plan.milestones.map(milestone => milestone.id);
  progress.completed.forEach((id, index) => {
    if (!ids.includes(id)) problems.push(`progress.json lists ${id} as completed, but the plan has no such milestone`);
    if (progress.completed.indexOf(id) !== index) problems.push(`progress.json lists ${id} as completed twice`);
    const milestone = plan.milestones.find(item => item.id === id);
    for (const dependency of milestone?.dependsOn ?? []) {
      if (!progress.completed.slice(0, index).includes(dependency)) problems.push(`${id} was completed before its dependency ${dependency}`);
    }
  });
  for (const id of progress.completed) {
    if (!await findCheckpoint(root, id)) problems.push(`No checkpoint commit exists for completed milestone ${id}`);
  }
  if (progress.current) {
    if (!ids.includes(progress.current.id)) problems.push(`progress.json has an unknown current milestone ${progress.current.id}`);
    if (progress.completed.includes(progress.current.id)) problems.push(`Current milestone ${progress.current.id} is already completed`);
    if (!await commitExists(root, progress.current.baseCommit)) problems.push(`The restore point ${progress.current.baseCommit} of ${progress.current.id} does not exist`);
  }
  if (progress.lastCheckpoint && !await commitExists(root, progress.lastCheckpoint)) problems.push(`The last checkpoint ${progress.lastCheckpoint} does not exist`);
  if (progress.status === 'complete' && ids.some(id => !progress.completed.includes(id))) problems.push('progress.json is complete, but some milestones are not completed');
  return problems;
}

import { FatalError } from '../core/errors.js';
import { exists, readJson, writeAtomic } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
import { findFeature } from '../spec/check.js';
import type { AcceptanceCriterion, Feature, ProjectSpec } from '../spec/types.js';

// milestone 1 件分の計画。一つ以上の完全な Feature を含む (§6.1, §6.2)
export type Milestone = {
  id: string; // M01
  features: string[]; // 対象 Feature ID
  dependsOn: string[]; // 依存 milestone ID
  approach: string; // 実装方針
  scope: string[]; // 想定変更領域
};

// 確定した milestone plan。.harness-state/plan.json に保存する (§6.2)
export type Plan = { milestones: Milestone[] };

// plan.json を読む。存在しなければ null、解釈できなければ FatalError (§23)
export async function loadPlan(root: string): Promise<Plan | null> {
  const file = projectPaths(root).plan;
  if (!await exists(file)) return null;
  let value: unknown;
  try { value = await readJson(file); }
  catch (error) { throw new FatalError(`Cannot read plan.json: ${(error as Error).message}`); }
  const strings = (item: unknown): boolean => Array.isArray(item) && item.every(entry => typeof entry === 'string');
  const milestones = (value as { milestones?: unknown } | null)?.milestones;
  const valid = Array.isArray(milestones) && milestones.every(item =>
    typeof item?.id === 'string' && strings(item.features) && strings(item.dependsOn) && typeof item.approach === 'string' && strings(item.scope));
  if (!valid) throw new FatalError('plan.json does not match the plan format');
  return value as Plan;
}

// plan.json を保存する
export async function savePlan(root: string, plan: Plan): Promise<void> {
  await writeAtomic(projectPaths(root).plan, plan);
}

// Feature の網羅性・重複の無い割り当て・依存関係の妥当性を検査して問題を列挙する (§6.1, §6.2, §9.4)
export function checkPlan(plan: Plan, spec: ProjectSpec): string[] {
  const problems: string[] = [];
  if (!plan.milestones.length) problems.push('The plan requires at least one milestone');
  const ids = plan.milestones.map(milestone => milestone.id);
  const assigned = new Map<string, string>();
  plan.milestones.forEach((milestone, index) => {
    if (milestone.id !== milestoneId(index)) problems.push(`Milestone ${index + 1} must have ID ${milestoneId(index)} (got ${milestone.id})`);
    if (!milestone.features.length) problems.push(`${milestone.id} has no Feature`);
    for (const feature of milestone.features) {
      if (!findFeature(spec, feature)) problems.push(`${milestone.id} references an unknown Feature: ${feature}`);
      const owner = assigned.get(feature);
      if (owner) problems.push(`${feature} is assigned to both ${owner} and ${milestone.id}; a Feature belongs to exactly one milestone`);
      assigned.set(feature, milestone.id);
    }
    for (const dependency of milestone.dependsOn) {
      if (!ids.includes(dependency) || dependency === milestone.id) problems.push(`${milestone.id} depends on an invalid milestone: ${dependency}`);
    }
  });
  for (const feature of spec.features) if (!assigned.has(feature.id)) problems.push(`${feature.id} is assigned to no milestone`);
  if (!problems.length && !topologicalOrder(plan)) problems.push('Milestone dependencies contain a cycle');
  return problems;
}

// 依存関係を満たす実行順に milestone を並べる。循環があれば FatalError (§10.2)
export function orderMilestones(plan: Plan): Milestone[] {
  const order = topologicalOrder(plan);
  if (!order) throw new FatalError('Milestone dependencies contain a cycle');
  return order;
}

// 完成済みでない milestone のうち、実行順で最初のものを返す。全て完成していれば null (§10.2)
export function nextMilestone(plan: Plan, completed: string[]): Milestone | null {
  return orderMilestones(plan).find(milestone => !completed.includes(milestone.id)) ?? null;
}

// milestone に所属する Feature を PROJECT.md から求める (§6.2)
export function milestoneFeatures(spec: ProjectSpec, milestone: Milestone): Feature[] {
  return milestone.features.map(id => {
    const feature = findFeature(spec, id);
    if (!feature) throw new FatalError(`${milestone.id} references ${id}, which PROJECT.md does not define`);
    return feature;
  });
}

// milestone に所属する AC を PROJECT.md から求める (§6.2)
export function milestoneCriteria(spec: ProjectSpec, milestone: Milestone): AcceptanceCriterion[] {
  return milestoneFeatures(spec, milestone).flatMap(feature => feature.criteria);
}

// 0 始まりの index から M01 形式の milestone ID を作る (§6.2)
export function milestoneId(index: number): string {
  return `M${String(index + 1).padStart(2, '0')}`;
}

// plan の記載順を保ちつつ、依存先が先に来る順に並べる。循環があれば null
function topologicalOrder(plan: Plan): Milestone[] | null {
  const order: Milestone[] = [];
  const pending = [...plan.milestones];
  while (pending.length) {
    const index = pending.findIndex(milestone => milestone.dependsOn.every(dependency => order.some(done => done.id === dependency)));
    if (index < 0) return null;
    order.push(...pending.splice(index, 1));
  }
  return order;
}

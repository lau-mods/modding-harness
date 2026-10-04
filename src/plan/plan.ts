import { FatalError } from '../core/errors.js';
import { exists, readJson, writeAtomic } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
import { activeCriteria } from '../spec/check.js';
import type { ProjectSpec } from '../spec/types.js';
import type { CheckpointRecord } from '../state/state.js';

// milestone 1 件分の計画 (§6)
export type Milestone = {
  id: string; // M01
  acIds: string[]; // 対象 Acceptance Criteria
  dependsOn: string[]; // 依存 milestone
  summary: string; // 実装対象の概要
  scope: string[]; // 想定する変更範囲
  e2eSummary: string; // E2E の概要
};

// 実装計画。作成時の PROJECT.md hash と紐付ける。excluded は計画時に除外した AC と理由 (§6)
export type Plan = { specHash: string; createdAt: string; milestones: Milestone[]; excluded: { acId: string; reason: string }[] };

// 保存済みの計画を読む。存在しなければ null、読めなければ FatalError (§20)
export async function loadPlan(root: string): Promise<Plan | null> {
  const file = projectPaths(root).plan;
  if (!await exists(file)) return null;
  try { return await readJson(file) as Plan; }
  catch (error) { throw new FatalError(`Cannot read the implementation plan: ${(error as Error).message}`); }
}

// 計画を保存する
export async function savePlan(root: string, plan: Plan): Promise<void> {
  await writeAtomic(projectPaths(root).plan, plan);
}

// 除外分を除く全 active AC がちょうど 1 つの milestone に割り当てられ、依存が先行していることなどを検査して問題を列挙する (§6)
export function checkPlan(plan: Plan, spec: ProjectSpec): string[] {
  const problems: string[] = [];
  if (plan.specHash !== spec.hash) problems.push('Plan was created for a different PROJECT.md');
  if (!plan.milestones.length) problems.push('Plan requires at least one milestone');
  const active = new Set(activeCriteria(spec).map(criterion => criterion.id));
  const assigned = new Set<string>();
  plan.milestones.forEach((milestone, index) => {
    if (milestone.id !== milestoneId(index)) problems.push(`Milestone ${index + 1} must have ID ${milestoneId(index)} (got ${milestone.id})`);
    if (!milestone.acIds.length) problems.push(`${milestone.id} has no Acceptance Criteria`);
    for (const id of milestone.acIds) {
      if (!active.has(id)) problems.push(`${milestone.id} references an unknown or retired AC: ${id}`);
      if (assigned.has(id)) problems.push(`${id} is assigned to more than one milestone`);
      assigned.add(id);
    }
    for (const dependency of milestone.dependsOn) {
      if (!plan.milestones.slice(0, index).some(previous => previous.id === dependency)) problems.push(`${milestone.id} depends on ${dependency}, which must come earlier`);
    }
  });
  for (const { acId } of plan.excluded) assigned.add(acId);
  for (const id of active) if (!assigned.has(id)) problems.push(`${id} is assigned to no milestone`);
  return problems;
}

// 0 始まりの index から M01 形式の milestone ID を作る (§6)
export function milestoneId(index: number): string {
  return `M${String(index + 1).padStart(2, '0')}`;
}

// checkpoint 済みでない最初の milestone を返す。全て完了していれば null
export function nextMilestone(plan: Plan, checkpoints: CheckpointRecord[]): Milestone | null {
  return plan.milestones.find(milestone => !checkpoints.some(checkpoint => checkpoint.milestone === milestone.id)) ?? null;
}

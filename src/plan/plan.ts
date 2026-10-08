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
  throw new Error('Not implemented');
}

// plan.json を保存する
export async function savePlan(root: string, plan: Plan): Promise<void> {
  throw new Error('Not implemented');
}

// Feature の網羅性・重複の無い割り当て・依存関係の妥当性を検査して問題を列挙する (§6.1, §6.2, §9.4)
export function checkPlan(plan: Plan, spec: ProjectSpec): string[] {
  throw new Error('Not implemented');
}

// 依存関係を満たす実行順に milestone を並べる。循環があれば FatalError (§10.2)
export function orderMilestones(plan: Plan): Milestone[] {
  throw new Error('Not implemented');
}

// 完成済みでない milestone のうち、実行順で最初のものを返す。全て完成していれば null (§10.2)
export function nextMilestone(plan: Plan, completed: string[]): Milestone | null {
  throw new Error('Not implemented');
}

// milestone に所属する Feature を PROJECT.md から求める (§6.2)
export function milestoneFeatures(spec: ProjectSpec, milestone: Milestone): Feature[] {
  throw new Error('Not implemented');
}

// milestone に所属する AC を PROJECT.md から求める (§6.2)
export function milestoneCriteria(spec: ProjectSpec, milestone: Milestone): AcceptanceCriterion[] {
  throw new Error('Not implemented');
}

// 0 始まりの index から M01 形式の milestone ID を作る (§6.2)
export function milestoneId(index: number): string {
  throw new Error('Not implemented');
}

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

// 実装計画。作成時の PROJECT.md hash と紐付ける
export type Plan = { specHash: string; createdAt: string; milestones: Milestone[] };

// 保存済みの計画を読む。存在しなければ null、読めなければ FatalError (§20)
export async function loadPlan(root: string): Promise<Plan | null> {
  throw new Error('Not implemented');
}

// 計画を保存する
export async function savePlan(root: string, plan: Plan): Promise<void> {
  throw new Error('Not implemented');
}

// 全 active AC がちょうど 1 つの milestone に割り当てられ、依存が先行していることなどを検査して問題を列挙する (§6)
export function checkPlan(plan: Plan, spec: ProjectSpec): string[] {
  throw new Error('Not implemented');
}

// 0 始まりの index から M01 形式の milestone ID を作る (§6)
export function milestoneId(index: number): string {
  throw new Error('Not implemented');
}

// checkpoint 済みでない最初の milestone を返す。全て完了していれば null
export function nextMilestone(plan: Plan, checkpoints: CheckpointRecord[]): Milestone | null {
  throw new Error('Not implemented');
}

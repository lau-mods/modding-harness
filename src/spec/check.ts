import type { AcceptanceCriterion, Feature, ProjectSpec } from './types.js';

// 構造と Feature ID / AC ID の形式・一意性・所属の整合を検査して問題を列挙する (§5.3, §5.4, §9.4)
export function checkSpec(spec: ProjectSpec): string[] {
  throw new Error('Not implemented');
}

// active にするための条件 (ID・version の確定、Feature と AC の存在、Open Questions の解消) を検査して問題を列挙する (§5.2)
export function checkActiveConditions(spec: ProjectSpec): string[] {
  throw new Error('Not implemented');
}

// ID で Feature を探す
export function findFeature(spec: ProjectSpec, id: string): Feature | null {
  throw new Error('Not implemented');
}

// ID で AC を探す
export function findCriterion(spec: ProjectSpec, id: string): AcceptanceCriterion | null {
  throw new Error('Not implemented');
}

// 全 Feature の AC を Feature 順に返す
export function allCriteria(spec: ProjectSpec): AcceptanceCriterion[] {
  throw new Error('Not implemented');
}

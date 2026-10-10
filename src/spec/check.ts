import type { AcceptanceCriterion, Feature, ProjectSpec } from './types.js';

// 構造と Feature ID / AC ID の形式・一意性・所属の整合を検査して問題を列挙する (§5.3, §5.4, §9.4)
export function checkSpec(spec: ProjectSpec): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const unique = (id: string): void => {
    if (seen.has(id)) problems.push(`Duplicate ID: ${id}`);
    seen.add(id);
  };
  for (const feature of spec.features) {
    unique(feature.id);
    const number = feature.id.match(/^F-(\d{3})$/)?.[1];
    if (!number) { problems.push(`Invalid Feature ID: ${feature.id} (expected F-001)`); continue; }
    for (const criterion of feature.criteria) {
      unique(criterion.id);
      if (!new RegExp(`^AC-F${number}-\\d{3}$`).test(criterion.id)) problems.push(`Invalid AC ID under ${feature.id}: ${criterion.id} (expected AC-F${number}-001)`);
      for (const [name, value] of [['Preconditions', criterion.preconditions], ['Action', criterion.action], ['Expected Result', criterion.expectedResult]]) {
        if (!value) problems.push(`${criterion.id} requires ${name}`);
      }
    }
  }
  return problems;
}

// active にするための条件 (ID・version の確定、Feature と AC の存在、Open Questions の解消) を検査して問題を列挙する (§5.2)
export function checkActiveConditions(spec: ProjectSpec): string[] {
  const problems: string[] = [];
  const required: [string, string][] = [
    ['Project ID', spec.projectId], ['Mod ID', spec.modId],
    ['Minecraft version', spec.platform.minecraft], ['NeoForge version', spec.platform.neoforge], ['Java version', spec.platform.java],
  ];
  for (const [name, value] of required) if (!value) problems.push(`${name} is required`);
  if (!spec.features.length) problems.push('At least one Feature is required');
  for (const feature of spec.features) if (!feature.criteria.length) problems.push(`${feature.id} requires at least one Acceptance Criterion`);
  if (spec.openQuestions !== 'None.') problems.push('Open Questions must be resolved (write "None.")');
  return problems;
}

// ID で Feature を探す
export function findFeature(spec: ProjectSpec, id: string): Feature | null {
  return spec.features.find(feature => feature.id === id) ?? null;
}

// ID で AC を探す
export function findCriterion(spec: ProjectSpec, id: string): AcceptanceCriterion | null {
  return allCriteria(spec).find(criterion => criterion.id === id) ?? null;
}

// 全 Feature の AC を Feature 順に返す
export function allCriteria(spec: ProjectSpec): AcceptanceCriterion[] {
  return spec.features.flatMap(feature => feature.criteria);
}

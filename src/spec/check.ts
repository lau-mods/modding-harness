import type { AcceptanceCriterion, ProjectSpec } from './types.js';

// ID 形式・一意性・Feature との親子関係・AC 必須項目など構造上の問題を列挙する (§3, §5)
export function checkStructure(spec: ProjectSpec): string[] {
  throw new Error('Not implemented');
}

// Status: active の条件 (ID・version 確定、active AC の存在、Open Questions 解消) を満たさない項目を列挙する (§4)
export function checkActivation(spec: ProjectSpec): string[] {
  throw new Error('Not implemented');
}

// 計画・開発できる仕様 (active かつ構造上の問題なし) であることを確認する。違反時は FatalError (§20)
export function requireActionable(spec: ProjectSpec): void {
  throw new Error('Not implemented');
}

// retired の Feature / AC を除いた active な AC を返す
export function activeCriteria(spec: ProjectSpec): AcceptanceCriterion[] {
  throw new Error('Not implemented');
}

// ID から AC を引く
export function findCriterion(spec: ProjectSpec, id: string): AcceptanceCriterion | undefined {
  throw new Error('Not implemented');
}

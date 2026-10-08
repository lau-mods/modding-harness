import type { Milestone } from '../plan/plan.js';
import type { ProjectSpec } from '../spec/types.js';

// GameTest testcase と AC の対応。report は JUnit XML のパス (§15.2)
export type GameTestMapping = { acId: string; report: string; classname: string; name: string };

// E2E scenario と AC の対応。scenario は tests/e2e/ 配下のファイル (§15.2, §16.3)
export type E2EMapping = { acId: string; scenario: string };

// tests/acceptance.json の内容 (§15.2)
export type AcceptanceMap = { gameTests: GameTestMapping[]; e2e: E2EMapping[] };

// tests/acceptance.json を読む。存在しなければ空の対応表を返す
export async function loadAcceptance(root: string): Promise<AcceptanceMap> {
  throw new Error('Not implemented');
}

// 対応表の形式と、参照する AC・scenario ファイルの存在を検査して問題を列挙する (§9.4)
export async function checkAcceptance(root: string, map: AcceptanceMap, spec: ProjectSpec): Promise<string[]> {
  throw new Error('Not implemented');
}

// milestone の AC がすべて GameTest または E2E に対応付けられているかを検査して問題を列挙する (§21.1, §24)
export function checkMilestoneCoverage(map: AcceptanceMap, spec: ProjectSpec, milestone: Milestone): string[] {
  throw new Error('Not implemented');
}

// 指定 AC に対応する GameTest を返す
export function gameTestsFor(map: AcceptanceMap, acIds: string[]): GameTestMapping[] {
  throw new Error('Not implemented');
}

// 指定 AC に対応する E2E を返す。空なら当該 milestone の E2E は実行しない (§10.2)
export function e2eFor(map: AcceptanceMap, acIds: string[]): E2EMapping[] {
  throw new Error('Not implemented');
}

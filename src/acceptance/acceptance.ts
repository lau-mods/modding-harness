import path from 'node:path';
import { ExecutionFailure } from '../core/errors.js';
import { exists, readJson } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
import type { Milestone } from '../plan/plan.js';
import { milestoneCriteria } from '../plan/plan.js';
import { findCriterion } from '../spec/check.js';
import type { ProjectSpec } from '../spec/types.js';

// GameTest testcase と AC の対応。report は JUnit XML のパス (§15.2)
export type GameTestMapping = { acId: string; report: string; classname: string; name: string };

// E2E scenario と AC の対応。scenario は tests/e2e/ 配下のファイル (§15.2, §16.3)
export type E2EMapping = { acId: string; scenario: string };

// tests/acceptance.json の内容 (§15.2)
export type AcceptanceMap = { gameTests: GameTestMapping[]; e2e: E2EMapping[] };

// tests/acceptance.json を読む。存在しなければ空の対応表を返す。Codex が保守するファイルのため、不正な内容は ExecutionFailure (§19.1)
export async function loadAcceptance(root: string): Promise<AcceptanceMap> {
  const file = projectPaths(root).acceptance;
  if (!await exists(file)) return { gameTests: [], e2e: [] };
  let value: unknown;
  try { value = await readJson(file); }
  catch (error) { throw new ExecutionFailure(`Cannot read tests/acceptance.json: ${(error as Error).message}`); }
  const map = value as Partial<AcceptanceMap> | null;
  const text = (item: unknown): boolean => typeof item === 'string' && item.length > 0;
  const valid = Array.isArray(map?.gameTests) && map.gameTests.every(item => text(item?.acId) && text(item.report) && text(item.classname) && text(item.name))
    && Array.isArray(map.e2e) && map.e2e.every(item => text(item?.acId) && text(item.scenario));
  if (!valid) {
    throw new ExecutionFailure('tests/acceptance.json does not match the format',
      '{"gameTests": [{"acId", "report", "classname", "name"}], "e2e": [{"acId", "scenario"}]} with non-empty strings');
  }
  return map as AcceptanceMap;
}

// 対応表の形式と、参照する AC・scenario ファイルの存在を検査して問題を列挙する (§9.4)
export async function checkAcceptance(root: string, map: AcceptanceMap, spec: ProjectSpec): Promise<string[]> {
  const problems: string[] = [];
  const e2eDir = projectPaths(root).e2e;
  for (const mapping of [...map.gameTests, ...map.e2e]) {
    if (!findCriterion(spec, mapping.acId)) problems.push(`tests/acceptance.json references an unknown AC: ${mapping.acId}`);
  }
  for (const mapping of map.e2e) {
    const file = path.resolve(root, mapping.scenario);
    if (path.relative(e2eDir, file).startsWith('..')) problems.push(`E2E scenario for ${mapping.acId} must be under tests/e2e/: ${mapping.scenario}`);
    else if (!await exists(file)) problems.push(`E2E scenario for ${mapping.acId} does not exist: ${mapping.scenario}`);
  }
  return problems;
}

// milestone の AC がすべて GameTest または E2E に対応付けられているかを検査して問題を列挙する (§21.1, §24)
export function checkMilestoneCoverage(map: AcceptanceMap, spec: ProjectSpec, milestone: Milestone): string[] {
  return milestoneCriteria(spec, milestone)
    .filter(criterion => !gameTestsFor(map, [criterion.id]).length && !e2eFor(map, [criterion.id]).length)
    .map(criterion => `${criterion.id} has no GameTest or E2E entry in tests/acceptance.json`);
}

// 指定 AC に対応する GameTest を返す
export function gameTestsFor(map: AcceptanceMap, acIds: string[]): GameTestMapping[] {
  return map.gameTests.filter(mapping => acIds.includes(mapping.acId));
}

// 指定 AC に対応する E2E を返す。空なら当該 milestone の E2E は実行しない (§10.2)
export function e2eFor(map: AcceptanceMap, acIds: string[]): E2EMapping[] {
  return map.e2e.filter(mapping => acIds.includes(mapping.acId));
}

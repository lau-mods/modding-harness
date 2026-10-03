import path from 'node:path';
import { readJson } from '../core/fs.js';

// project 内の scenario manifest の位置 (§12, §13)
export const MANIFEST_FILE = 'tests/e2e/manifest.json';

// manifest に記述する scenario 1 件 (§13)
export type ScenarioDefinition = { id: string; acIds: string[]; command: string[] };

// scenario manifest (§13)
export type ScenarioManifest = { scenarios: ScenarioDefinition[] };

// manifest を読み込み検証する。存在しない・不正な場合は例外を投げる
export async function loadManifest(root: string): Promise<ScenarioManifest> {
  const value = await readJson(path.join(root, MANIFEST_FILE)).catch((error: Error) => { throw new Error(`Cannot read ${MANIFEST_FILE}: ${error.message}`); });
  const scenarios = (value as { scenarios?: unknown })?.scenarios;
  const strings = (item: unknown): item is string[] => Array.isArray(item) && item.length > 0 && item.every(entry => typeof entry === 'string' && entry);
  if (!Array.isArray(scenarios) || !scenarios.every(item => typeof item?.id === 'string' && item.id && strings(item.acIds) && strings(item.command))) {
    throw new Error(`${MANIFEST_FILE} requires "scenarios": [{"id": string, "acIds": string[], "command": string[]}]`);
  }
  return { scenarios };
}

// 指定 AC を対象に含む scenario を選ぶ
export function selectScenarios(manifest: ScenarioManifest, acIds: string[]): ScenarioDefinition[] {
  return manifest.scenarios.filter(scenario => scenario.acIds.some(id => acIds.includes(id)));
}

// どの scenario にも対応付けられていない AC ID を返す
export function uncoveredCriteria(manifest: ScenarioManifest, acIds: string[]): string[] {
  return acIds.filter(id => !manifest.scenarios.some(scenario => scenario.acIds.includes(id)));
}

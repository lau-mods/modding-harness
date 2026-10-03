// project 内の scenario manifest の位置 (§12, §13)
export const MANIFEST_FILE = 'tests/e2e/manifest.json';

// manifest に記述する scenario 1 件 (§13)
export type ScenarioDefinition = { id: string; acIds: string[]; command: string[] };

// scenario manifest (§13)
export type ScenarioManifest = { scenarios: ScenarioDefinition[] };

// manifest を読み込み検証する。存在しない・不正な場合は例外を投げる
export async function loadManifest(root: string): Promise<ScenarioManifest> {
  throw new Error('Not implemented');
}

// 指定 AC を対象に含む scenario を選ぶ
export function selectScenarios(manifest: ScenarioManifest, acIds: string[]): ScenarioDefinition[] {
  throw new Error('Not implemented');
}

// どの scenario にも対応付けられていない AC ID を返す
export function uncoveredCriteria(manifest: ScenarioManifest, acIds: string[]): string[] {
  throw new Error('Not implemented');
}

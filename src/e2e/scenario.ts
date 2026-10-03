import type { RuntimeConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
import type { ScenarioDefinition } from './manifest.js';
import type { RuntimeSession } from './runtime.js';

// scenario 内の 1 観測 (§13)
export type Assertion = { name: string; expected: unknown; actual: unknown; passed: boolean };

// scenario process が出力する machine-readable な結果 (§13)
export type ScenarioResult = { scenarioId: string; passed: boolean; assertions: Assertion[]; screenshots: string[] };

// scenario 1 件の実行記録。結果ファイル・ログ・screenshot の保存先を含む
export type ScenarioRun = { scenario: ScenarioDefinition; result: ScenarioResult; resultFile: string; logDir: string; screenshotDir: string };

// scenario を通常の実行可能プログラムとして起動し、結果 JSON を読む。process 失敗・結果欠落は ExecutionFailure (§12, §17)
export async function runScenario(root: string, config: RuntimeConfig, scenario: ScenarioDefinition, session: RuntimeSession, logDir: string, runner: Runner): Promise<ScenarioRun> {
  throw new Error('Not implemented');
}

// 結果 JSON を検証して ScenarioResult にする。scenarioId の不一致も検出する
export function parseScenarioResult(value: unknown, scenarioId: string): ScenarioResult {
  throw new Error('Not implemented');
}

// assertion の観測結果から scenario の成否を判定する (§13)
export function judge(result: ScenarioResult): boolean {
  throw new Error('Not implemented');
}

import type { E2EMapping } from '../acceptance/acceptance.js';
import type { RuntimeConfig } from '../config/config.js';
import type { FailureReport } from '../core/errors.js';
import type { Runner } from '../core/process.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { ScenarioResult } from './scenario.js';

// E2E 工程の実行結果。表示内容の合否は Claude の E2E レビューで決める (§16.4)
export type E2ERunSummary = { scenarios: ScenarioResult[]; logs: string[]; logDir: string };

// Mod 配置 → server / client 起動 → 各 scenario 実行 → 結果保存 → 停止 の lifecycle で E2E を実行する (§16.2)
export async function runE2E(root: string, config: RuntimeConfig, mappings: E2EMapping[], modJar: string, logDir: string, runner: Runner): Promise<E2ERunSummary> {
  throw new Error('Not implemented');
}

// E2E 実行失敗の対象 AC・エラー・log を Codex 向けの失敗情報にまとめる (§19.2)
export function e2eFailureReport(summary: E2ERunSummary, criteria: AcceptanceCriterion[]): FailureReport {
  throw new Error('Not implemented');
}

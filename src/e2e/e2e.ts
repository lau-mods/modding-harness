import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { Assertion, ScenarioResult, ScenarioRun } from './scenario.js';

// milestone の E2E 実行結果のまとめ
export type E2ERunSummary = {
  passed: boolean;
  runs: ScenarioRun[];
  uncovered: string[]; // scenario が存在しない AC ID
  screenshots: string[];
  logFiles: string[];
};

// assertion failure 時に Codex へ渡す情報 (§19)
export type E2EFailureReport = {
  criteria: { id: string; expectedResult: string }[];
  failures: { scenarioId: string; assertion: Assertion }[];
  uncovered: string[];
  logs: string[];
  screenshots: string[];
  results: ScenarioResult[];
};

// scenario の進行を state へ反映するためのフック (§24 Current E2E scenario)
export type E2EHooks = { onScenario?: (scenarioId: string) => Promise<void> };

// 実機環境を準備・起動し、milestone の AC に対応する scenario を実行して停止する (§12, §14)
export async function runE2E(root: string, config: HarnessConfig, criteria: AcceptanceCriterion[], logDir: string, runner: Runner, hooks?: E2EHooks): Promise<E2ERunSummary> {
  throw new Error('Not implemented');
}

// 失敗した E2E 結果から Codex 向けの報告を作る (§19)
export function failureReport(summary: E2ERunSummary, criteria: AcceptanceCriterion[]): E2EFailureReport {
  throw new Error('Not implemented');
}

// 画面確認が必要か (screenshot が取得されているか) を判定する (§15)
export function needsVisualReview(summary: E2ERunSummary): boolean {
  throw new Error('Not implemented');
}

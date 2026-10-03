import path from 'node:path';
import { findModJar } from '../build/gradle.js';
import type { HarnessConfig } from '../config/config.js';
import { exists } from '../core/fs.js';
import type { Runner } from '../core/process.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import { loadManifest, selectScenarios, uncoveredCriteria } from './manifest.js';
import { collectLogs, deployMod, startRuntime, stopClients, stopRuntime } from './runtime.js';
import type { RuntimeSession } from './runtime.js';
import { judge, runScenario } from './scenario.js';
import type { Assertion, ScenarioResult, ScenarioRun } from './scenario.js';

// milestone の E2E 実行結果のまとめ
export type E2ERunSummary = {
  passed: boolean;
  runs: ScenarioRun[];
  uncovered: string[]; // scenario が存在しない AC ID
  problems: string[]; // manifest や結果の不備
  screenshots: string[];
  logFiles: string[];
};

// assertion failure 時に Codex へ渡す情報 (§19)
export type E2EFailureReport = {
  criteria: { id: string; expectedResult: string }[];
  failures: { scenarioId: string; assertion: Assertion }[];
  uncovered: string[];
  problems: string[];
  logs: string[];
  screenshots: string[];
  results: ScenarioResult[];
};

// scenario の進行を state へ反映するためのフック (§24 Current E2E scenario)
export type E2EHooks = { onScenario?: (scenarioId: string) => Promise<void> };

// mod を配置して server を起動し、milestone の AC に対応する scenario を順に実行して停止する (§12, §14)
export async function runE2E(root: string, config: HarnessConfig, criteria: AcceptanceCriterion[], logDir: string, runner: Runner, hooks?: E2EHooks): Promise<E2ERunSummary> {
  const acIds = criteria.map(criterion => criterion.id);
  const failed = (uncovered: string[], problems: string[]): E2ERunSummary => ({ passed: false, runs: [], uncovered, problems, screenshots: [], logFiles: [] });
  let manifest;
  try { manifest = await loadManifest(root); }
  catch (error) { return failed(acIds, [(error as Error).message]); }
  const uncovered = uncoveredCriteria(manifest, acIds);
  if (uncovered.length) return failed(uncovered, []);

  await deployMod(root, config.runtime, await findModJar(root));
  const runs: ScenarioRun[] = [];
  let session: RuntimeSession | null = null;
  let logFiles: string[] = [];
  try {
    session = await startRuntime(root, config.runtime, path.join(logDir, 'runtime'), runner);
    for (const scenario of selectScenarios(manifest, acIds)) {
      await hooks?.onScenario?.(scenario.id);
      runs.push(await runScenario(root, config.runtime, scenario, session, path.join(logDir, 'scenarios', scenario.id), runner));
      await stopClients(root, config.runtime, runner);
    }
  } finally {
    await stopRuntime(root, config.runtime, runner);
    if (session) logFiles = await collectLogs(root, session);
  }

  const screenshots: string[] = [];
  for (const run of runs) {
    for (const name of run.result.screenshots) {
      const file = path.resolve(run.screenshotDir, name);
      if (await exists(file)) screenshots.push(file);
    }
  }
  const problems = runs.filter(run => !run.result.assertions.length).map(run => `Scenario ${run.scenario.id} reported no assertions`);
  return { passed: runs.every(run => judge(run.result)), runs, uncovered: [], problems, screenshots, logFiles };
}

// 失敗した E2E 結果から Codex 向けの報告を作る (§19)
export function failureReport(summary: E2ERunSummary, criteria: AcceptanceCriterion[]): E2EFailureReport {
  return {
    criteria: criteria.map(criterion => ({ id: criterion.id, expectedResult: criterion.expectedResult })),
    failures: summary.runs.flatMap(run => run.result.assertions.filter(assertion => !assertion.passed).map(assertion => ({ scenarioId: run.scenario.id, assertion }))),
    uncovered: summary.uncovered,
    problems: summary.problems,
    logs: summary.logFiles,
    screenshots: summary.screenshots,
    results: summary.runs.map(run => run.result),
  };
}

// 画面確認が必要か (screenshot が取得されているか) を判定する (§15)
export function needsVisualReview(summary: E2ERunSummary): boolean {
  return summary.screenshots.length > 0;
}

import path from 'node:path';
import type { E2EMapping } from '../acceptance/acceptance.js';
import type { RuntimeConfig } from '../config/config.js';
import { ExecutionFailure } from '../core/errors.js';
import type { Runner } from '../core/process.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import { collectLogs, deployMod, startRuntime, stopRuntime } from './runtime.js';
import { groupScenarios, runScenario } from './scenario.js';
import type { ScenarioResult } from './scenario.js';

// E2E 工程の実行結果。表示内容の合否は Claude の E2E レビューで決める (§16.4)
export type E2ERunSummary = { scenarios: ScenarioResult[]; logs: string[]; logDir: string };

// Mod 配置 → server / client 起動 → 各 scenario 実行 → 結果保存 → 停止 の lifecycle で E2E を実行する。起動失敗は log を添えた ExecutionFailure (§16.2)
export async function runE2E(root: string, config: RuntimeConfig, mappings: E2EMapping[], modJar: string, logDir: string, runner: Runner): Promise<E2ERunSummary> {
  await deployMod(root, config, modJar);
  const runtimeLogDir = path.join(logDir, 'runtime');
  const scenarios: ScenarioResult[] = [];
  let failure: ExecutionFailure | null = null;
  try {
    const session = await startRuntime(root, config, runtimeLogDir, runner);
    for (const scenario of groupScenarios(mappings)) {
      scenarios.push(await runScenario(root, config, scenario, session, path.join(logDir, 'scenarios', scenario.id.replace(/[^\w.-]+/g, '-')), runner));
    }
  } catch (error) {
    if (!(error instanceof ExecutionFailure)) throw error;
    failure = error;
  } finally {
    await stopRuntime(root, config, runner);
  }
  const logs = await collectLogs(root, config, runtimeLogDir);
  if (failure) throw new ExecutionFailure(failure.message, failure.details, [...new Set([...failure.logs, ...logs])]);
  return { scenarios, logs, logDir };
}

// E2E 実行失敗の対象 AC・エラー・log を Codex 向けの ExecutionFailure にまとめる (§19.2)
export function e2eFailure(summary: E2ERunSummary, criteria: AcceptanceCriterion[]): ExecutionFailure {
  const failed = summary.scenarios.filter(scenario => !scenario.success);
  const details = failed.map(scenario => [
    `${scenario.scenarioId}: ${scenario.error}`,
    ...scenario.acIds.map(acId => `${acId} Expected Result: ${criteria.find(criterion => criterion.id === acId)?.expectedResult ?? '(unknown)'}`),
  ].join('\n'));
  const logs = [...summary.logs, ...failed.flatMap(scenario => [path.join(scenario.logDir, 'stdout.log'), path.join(scenario.logDir, 'stderr.log')])];
  return new ExecutionFailure(`${failed.length} E2E scenario(s) failed`, details.join('\n\n'), logs, failed.flatMap(scenario => scenario.screenshots.map(shot => shot.file)));
}

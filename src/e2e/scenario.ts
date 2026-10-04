import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeConfig } from '../config/config.js';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import { readJson } from '../core/fs.js';
import type { ProcessResult, Runner } from '../core/process.js';
import { tail } from '../core/process.js';
import type { ScenarioDefinition } from './manifest.js';
import { scenarioEnv } from './runtime.js';
import type { RuntimeSession } from './runtime.js';

// scenario 内の 1 観測 (§13)
export type Assertion = { name: string; expected: unknown; actual: unknown; passed: boolean };

// scenario process が出力する machine-readable な結果 (§13)
export type ScenarioResult = { scenarioId: string; passed: boolean; assertions: Assertion[]; screenshots: string[] };

// scenario 1 件の実行記録。結果ファイル・ログ・screenshot の保存先を含む
export type ScenarioRun = { scenario: ScenarioDefinition; result: ScenarioResult; resultFile: string; logDir: string; screenshotDir: string };

const SCENARIO_TIMEOUT_MS = 30 * 60 * 1000;

// scenario を通常の実行可能プログラムとして起動し、結果 JSON を読む。process 失敗・結果欠落は ExecutionFailure (§12, §17)
export async function runScenario(root: string, config: RuntimeConfig, scenario: ScenarioDefinition, session: RuntimeSession, logDir: string, runner: Runner): Promise<ScenarioRun> {
  const resultFile = path.join(logDir, 'result.json');
  const screenshotDir = path.join(logDir, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });
  const [command, ...args] = scenario.command;
  let execution: ProcessResult;
  try {
    execution = await runner(command!, args, { cwd: root, env: scenarioEnv(root, config, session, scenario, resultFile, screenshotDir), logDir, timeoutMs: SCENARIO_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof FatalError) throw new ExecutionFailure(`E2E scenario ${scenario.id} could not start: ${error.message}`);
    throw error;
  }
  if (execution.code !== 0) throw new ExecutionFailure(`E2E scenario ${scenario.id} exited with ${execution.code}: ${tail(execution.stderr + execution.stdout, 2000)}`);
  let value: unknown;
  try { value = await readJson(resultFile); }
  catch (error) { throw new ExecutionFailure(`E2E scenario ${scenario.id} wrote no readable result: ${(error as Error).message}`); }
  return { scenario, result: parseScenarioResult(value, scenario.id), resultFile, logDir, screenshotDir };
}

// 結果 JSON を検証して ScenarioResult にする。scenarioId の不一致も検出する
export function parseScenarioResult(value: unknown, scenarioId: string): ScenarioResult {
  const result = value as Partial<ScenarioResult> | null;
  const valid = result !== null && typeof result === 'object'
    && result.scenarioId === scenarioId
    && typeof result.passed === 'boolean'
    && Array.isArray(result.assertions) && result.assertions.every(item => typeof item?.name === 'string' && typeof item.passed === 'boolean')
    && Array.isArray(result.screenshots) && result.screenshots.every(item => typeof item === 'string');
  if (!valid) throw new ExecutionFailure(`E2E scenario ${scenarioId} wrote a result that does not match the scenario result format`);
  return { scenarioId, passed: result.passed!, assertions: result.assertions!, screenshots: result.screenshots! };
}

// assertion の観測結果から scenario の成否を判定する。1 件以上の assertion がすべて成功したとき成功 (§13)
export function judge(result: ScenarioResult): boolean {
  return result.assertions.length > 0 && result.assertions.every(assertion => assertion.passed);
}

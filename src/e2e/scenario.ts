import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { E2EMapping } from '../acceptance/acceptance.js';
import type { RuntimeConfig } from '../config/config.js';
import { ExecutionFailure } from '../core/errors.js';
import { exists, readJson } from '../core/fs.js';
import { harnessRoot } from '../core/paths.js';
import type { Runner } from '../core/process.js';
import { tail } from '../core/process.js';
import { pilotEnv } from './runtime.js';
import type { RuntimeSession } from './runtime.js';

// 実行する scenario。同じ scenario ファイルに対応付けた AC をまとめる。id は scenario ファイルのパス (§16.3)
export type ScenarioDefinition = { id: string; file: string; acIds: string[] };

// scenario が撮影した screenshot と対象 AC。file は絶対パス (§16.2 Screenshot と AC の対応付け)
export type Screenshot = { acId: string; file: string; label: string };

// scenario 1 件の実行結果。success はシーン準備と screenshot 取得の完了を表す (§16.4)
export type ScenarioResult = {
  scenarioId: string;
  acIds: string[];
  success: boolean;
  screenshots: Screenshot[];
  error: string | null;
  logDir: string; // 実行 log の保存先
};

const SCENARIO_TIMEOUT_MS = 30 * 60 * 1000;

// 対応表の E2E を scenario ファイル単位にまとめる
export function groupScenarios(mappings: E2EMapping[]): ScenarioDefinition[] {
  const scenarios = new Map<string, ScenarioDefinition>();
  for (const mapping of mappings) {
    const scenario = scenarios.get(mapping.scenario) ?? { id: mapping.scenario, file: mapping.scenario, acIds: [] };
    if (!scenario.acIds.includes(mapping.acId)) scenario.acIds.push(mapping.acId);
    scenarios.set(mapping.scenario, scenario);
  }
  return [...scenarios.values()];
}

// scenario を node で実行し、結果ファイルを読む。process 失敗・結果欠落・screenshot 欠落は success: false の結果にする (§16.4)
export async function runScenario(root: string, config: RuntimeConfig, scenario: ScenarioDefinition, session: RuntimeSession, logDir: string, runner: Runner): Promise<ScenarioResult> {
  const resultFile = path.join(logDir, 'result.json');
  const screenshotDir = path.join(logDir, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });
  const failed = (error: string): ScenarioResult => ({ scenarioId: scenario.id, acIds: scenario.acIds, success: false, screenshots: [], error, logDir });
  try {
    const execution = await runner(process.execPath, [path.resolve(root, scenario.file)], {
      cwd: root, env: scenarioEnv(root, config, session, scenario, resultFile, screenshotDir), logDir, timeoutMs: SCENARIO_TIMEOUT_MS,
    });
    if (execution.code !== 0) return failed(`Scenario exited with ${execution.code}: ${tail(execution.stderr + execution.stdout, 2000)}`);
    const result = parseScenarioResult(await readJson(resultFile), scenario, screenshotDir, logDir);
    if (result.error) return { ...result, success: false };
    for (const shot of result.screenshots) {
      if (!await exists(shot.file)) return { ...result, success: false, error: `Screenshot was not saved: ${shot.file}` };
    }
    const missing = scenario.acIds.filter(acId => !result.screenshots.some(shot => shot.acId === acId));
    if (missing.length) return { ...result, success: false, error: `No screenshot was taken for ${missing.join(', ')}` };
    return result;
  } catch (error) {
    if (error instanceof ExecutionFailure || error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return failed((error as Error).message);
    throw error;
  }
}

// scenario process に渡す環境変数 (MC Pilot command・client 名・結果と screenshot の出力先など) を組み立てる (§16.2)
export function scenarioEnv(root: string, config: RuntimeConfig, session: RuntimeSession, scenario: ScenarioDefinition, resultFile: string, screenshotDir: string): NodeJS.ProcessEnv {
  return {
    ...pilotEnv(root),
    HARNESS_MCT: config.command,
    HARNESS_E2E_LIB: path.join(harnessRoot(), 'e2e', 'lib.mjs'),
    HARNESS_CLIENTS: JSON.stringify(session.clients),
    HARNESS_RESULT_FILE: resultFile,
    HARNESS_SCREENSHOT_DIR: screenshotDir,
    HARNESS_SCENARIO_ID: scenario.id,
    HARNESS_AC_IDS: JSON.stringify(scenario.acIds),
  };
}

// scenario が書いた結果 JSON を検証して ScenarioResult にする。screenshot のパスは screenshotDir 基準で解決する。形式違反は ExecutionFailure
export function parseScenarioResult(value: unknown, scenario: ScenarioDefinition, screenshotDir: string, logDir: string): ScenarioResult {
  const result = value as { scenarioId?: unknown; screenshots?: unknown; error?: unknown } | null;
  const shots = result?.screenshots;
  const valid = result?.scenarioId === scenario.id
    && (result.error === null || typeof result.error === 'string')
    && Array.isArray(shots) && shots.every(shot => typeof shot?.acId === 'string' && typeof shot.file === 'string' && typeof shot.label === 'string');
  if (!valid) throw new ExecutionFailure(`Scenario ${scenario.id} wrote a result that does not match the scenario result format`);
  return {
    scenarioId: scenario.id,
    acIds: scenario.acIds,
    success: true,
    screenshots: (shots as Screenshot[]).map(shot => ({ ...shot, file: path.resolve(screenshotDir, shot.file) })),
    error: result.error as string | null,
    logDir,
  };
}

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import { readJson } from '../core/fs.js';
import { tail } from '../core/process.js';
import { scenarioEnv } from './runtime.js';
const SCENARIO_TIMEOUT_MS = 30 * 60 * 1000;
// scenario を通常の実行可能プログラムとして起動し、結果 JSON を読む。process 失敗・結果欠落は ExecutionFailure (§12, §17)
export async function runScenario(root, config, scenario, session, logDir, runner) {
    const resultFile = path.join(logDir, 'result.json');
    const screenshotDir = path.join(logDir, 'screenshots');
    await mkdir(screenshotDir, { recursive: true });
    const [command, ...args] = scenario.command;
    let execution;
    try {
        execution = await runner(command, args, { cwd: root, env: scenarioEnv(root, config, session, scenario, resultFile, screenshotDir), logDir, timeoutMs: SCENARIO_TIMEOUT_MS });
    }
    catch (error) {
        if (error instanceof FatalError)
            throw new ExecutionFailure(`E2E scenario ${scenario.id} could not start: ${error.message}`);
        throw error;
    }
    if (execution.code !== 0)
        throw new ExecutionFailure(`E2E scenario ${scenario.id} exited with ${execution.code}: ${tail(execution.stderr + execution.stdout, 2000)}`);
    let value;
    try {
        value = await readJson(resultFile);
    }
    catch (error) {
        throw new ExecutionFailure(`E2E scenario ${scenario.id} wrote no readable result: ${error.message}`);
    }
    return { scenario, result: parseScenarioResult(value, scenario.id), resultFile, logDir, screenshotDir };
}
// 結果 JSON を検証して ScenarioResult にする。scenarioId の不一致も検出する
export function parseScenarioResult(value, scenarioId) {
    const result = value;
    const valid = result !== null && typeof result === 'object'
        && result.scenarioId === scenarioId
        && typeof result.passed === 'boolean'
        && Array.isArray(result.assertions) && result.assertions.every(item => typeof item?.name === 'string' && typeof item.passed === 'boolean')
        && Array.isArray(result.screenshots) && result.screenshots.every(item => typeof item === 'string');
    if (!valid)
        throw new ExecutionFailure(`E2E scenario ${scenarioId} wrote a result that does not match the scenario result format`);
    return { scenarioId, passed: result.passed, assertions: result.assertions, screenshots: result.screenshots };
}
// assertion の観測結果から scenario の成否を判定する。1 件以上の assertion がすべて成功したとき成功 (§13)
export function judge(result) {
    return result.assertions.length > 0 && result.assertions.every(assertion => assertion.passed);
}
//# sourceMappingURL=scenario.js.map
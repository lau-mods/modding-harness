import path from 'node:path';
import { findModJar } from '../build/gradle.js';
import { exists } from '../core/fs.js';
import { loadManifest, selectScenarios, uncoveredCriteria } from './manifest.js';
import { collectLogs, deployMod, startRuntime, stopRuntime } from './runtime.js';
import { judge, runScenario } from './scenario.js';
// mod を配置して server と client を起動し、milestone の AC に対応する scenario のうち成功済み (passed) 以外を順に実行して停止する (§12, §14)
export async function runE2E(root, config, criteria, passed, logDir, runner, hooks) {
    const acIds = criteria.map(criterion => criterion.id);
    const failed = (uncovered, problems) => ({ passed: false, runs: [], uncovered, problems, screenshots: [], logFiles: [] });
    let manifest;
    try {
        manifest = await loadManifest(root);
    }
    catch (error) {
        return failed(acIds, [error.message]);
    }
    const uncovered = uncoveredCriteria(manifest, acIds);
    if (uncovered.length)
        return failed(uncovered, []);
    const scenarios = selectScenarios(manifest, acIds).filter(scenario => !passed.includes(scenario.id));
    if (!scenarios.length)
        return { passed: true, runs: [], uncovered: [], problems: [], screenshots: [], logFiles: [] };
    await deployMod(root, config.runtime, await findModJar(root));
    const runs = [];
    let session = null;
    let logFiles = [];
    try {
        session = await startRuntime(root, config.runtime, path.join(logDir, 'runtime'), runner);
        for (const scenario of scenarios) {
            await hooks?.onScenario?.(scenario.id);
            runs.push(await runScenario(root, config.runtime, scenario, session, path.join(logDir, 'scenarios', scenario.id), runner));
        }
    }
    finally {
        await stopRuntime(root, config.runtime, runner);
        if (session)
            logFiles = await collectLogs(root, session);
    }
    const screenshots = [];
    for (const run of runs) {
        for (const name of run.result.screenshots) {
            const file = path.resolve(run.screenshotDir, name);
            if (await exists(file))
                screenshots.push(file);
        }
    }
    const problems = runs.filter(run => !run.result.assertions.length).map(run => `Scenario ${run.scenario.id} reported no assertions`);
    return { passed: runs.every(run => judge(run.result)), runs, uncovered: [], problems, screenshots, logFiles };
}
// 失敗した E2E 結果から Codex 向けの報告を作る (§19)
export function failureReport(summary, criteria) {
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
export function needsVisualReview(summary) {
    return summary.screenshots.length > 0;
}
//# sourceMappingURL=e2e.js.map
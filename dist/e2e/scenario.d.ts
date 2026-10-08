import type { RuntimeConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
import type { ScenarioDefinition } from './manifest.js';
import type { RuntimeSession } from './runtime.js';
export type Assertion = {
    name: string;
    expected: unknown;
    actual: unknown;
    passed: boolean;
};
export type ScenarioResult = {
    scenarioId: string;
    passed: boolean;
    assertions: Assertion[];
    screenshots: string[];
};
export type ScenarioRun = {
    scenario: ScenarioDefinition;
    result: ScenarioResult;
    resultFile: string;
    logDir: string;
    screenshotDir: string;
};
export declare function runScenario(root: string, config: RuntimeConfig, scenario: ScenarioDefinition, session: RuntimeSession, logDir: string, runner: Runner): Promise<ScenarioRun>;
export declare function parseScenarioResult(value: unknown, scenarioId: string): ScenarioResult;
export declare function judge(result: ScenarioResult): boolean;

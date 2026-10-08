import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { Assertion, ScenarioResult, ScenarioRun } from './scenario.js';
export type E2ERunSummary = {
    passed: boolean;
    runs: ScenarioRun[];
    uncovered: string[];
    problems: string[];
    screenshots: string[];
    logFiles: string[];
};
export type E2EFailureReport = {
    criteria: {
        id: string;
        expectedResult: string;
    }[];
    failures: {
        scenarioId: string;
        assertion: Assertion;
    }[];
    uncovered: string[];
    problems: string[];
    logs: string[];
    screenshots: string[];
    results: ScenarioResult[];
};
export type E2EHooks = {
    onScenario?: (scenarioId: string) => Promise<void>;
};
export declare function runE2E(root: string, config: HarnessConfig, criteria: AcceptanceCriterion[], passed: string[], logDir: string, runner: Runner, hooks?: E2EHooks): Promise<E2ERunSummary>;
export declare function failureReport(summary: E2ERunSummary, criteria: AcceptanceCriterion[]): E2EFailureReport;
export declare function needsVisualReview(summary: E2ERunSummary): boolean;

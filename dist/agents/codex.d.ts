import type { BuildResult } from '../build/gradle.js';
import type { E2EFailureReport } from '../e2e/e2e.js';
import type { ScenarioDefinition } from '../e2e/manifest.js';
import type { Milestone } from '../plan/plan.js';
import type { IssueResponse, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';
export type ImplementationInput = {
    milestone: Milestone;
    criteria: AcceptanceCriterion[];
    projectMarkdown: string;
    relatedFiles: string[];
    buildFailure: BuildResult | null;
    codeIssues: ReviewIssue[];
    visualIssues: ReviewIssue[];
    e2eFailure: E2EFailureReport | null;
    passedScenarios: ScenarioDefinition[];
};
export type ImplementationOutput = {
    summary: string;
    changedFiles: string[];
    responses: IssueResponse[];
};
export declare function codexArgs(call: AgentCall, request: AgentRequest, schemaFile: string, outputFile: string): string[];
export declare function runCodex<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>>;
export declare function implement(call: AgentCall, input: ImplementationInput): Promise<ImplementationOutput>;

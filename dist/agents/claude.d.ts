import type { ScenarioResult } from '../e2e/scenario.js';
import type { Milestone, Plan } from '../plan/plan.js';
import type { IssueVerdict, ReviewFinding, ReviewIssue } from '../review/issues.js';
import type { AcceptanceCriterion } from '../spec/types.js';
import type { AgentCall, AgentRequest, AgentResult } from './agent.js';
export type PlanInput = {
    projectMarkdown: string;
    criteria: AcceptanceCriterion[];
    projectFiles: string[];
};
export type PlanProposal = Pick<Plan, 'milestones' | 'excluded'>;
export type SpecEditInput = {
    request: string;
    projectMarkdown: string;
};
export type SpecEditOutput = {
    projectMarkdown: string;
    summary: string;
};
export type CodeReviewInput = {
    milestone: Milestone;
    criteria: AcceptanceCriterion[];
    diff: string;
    changedFiles: string[];
    scenarioFiles: string[];
};
export type VisualReviewInput = {
    milestone: Milestone;
    criteria: AcceptanceCriterion[];
    screenshots: string[];
    results: ScenarioResult[];
};
export declare function claudeArgs(call: AgentCall, request: AgentRequest): string[];
export declare function runClaude<T>(call: AgentCall, request: AgentRequest): Promise<AgentResult<T>>;
export declare function proposePlan(call: AgentCall, input: PlanInput): Promise<PlanProposal>;
export declare function editSpec(call: AgentCall, input: SpecEditInput): Promise<SpecEditOutput>;
export declare function reviewCode(call: AgentCall, input: CodeReviewInput): Promise<AgentResult<ReviewFinding[]>>;
export declare function recheckCode(call: AgentCall, input: CodeReviewInput, issues: ReviewIssue[], sessionId: string | null): Promise<AgentResult<IssueVerdict[]>>;
export declare function reviewVisual(call: AgentCall, input: VisualReviewInput): Promise<AgentResult<ReviewFinding[]>>;
export declare function recheckVisual(call: AgentCall, input: VisualReviewInput, issues: ReviewIssue[], sessionId: string | null): Promise<AgentResult<IssueVerdict[]>>;

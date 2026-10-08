import type { BuildResult } from '../build/gradle.js';
import type { E2EFailureReport, E2ERunSummary } from '../e2e/e2e.js';
import type { ScenarioDefinition } from '../e2e/manifest.js';
import type { IssueSet } from '../review/issues.js';
export type Phase = 'idle' | 'preflight' | 'planning' | 'implementation' | 'build' | 'code_review' | 'e2e' | 'visual_review' | 'checkpoint' | 'rollback' | 'fatal' | 'complete';
export type CheckpointRecord = {
    milestone: string;
    commit: string;
    acIds: string[];
    createdAt: string;
};
export type RollbackRecord = {
    milestone: string;
    operation: string;
    reason: string;
    restoredTo: string;
    at: string;
};
export type RetryState = {
    operation: string;
    attempt: number;
};
export type MilestoneRuntime = {
    milestone: string;
    baseCommit: string;
    iteration: number;
    buildFailure: BuildResult | null;
    codeReview: IssueSet | null;
    visualReview: IssueSet | null;
    e2e: E2ERunSummary | null;
    e2eFailure: E2EFailureReport | null;
    scenario: string | null;
    passedScenarios: ScenarioDefinition[];
};
export type HarnessState = {
    phase: Phase;
    planLocked: boolean;
    currentMilestone: string | null;
    checkpoints: CheckpointRecord[];
    milestone: MilestoneRuntime | null;
    retry: RetryState | null;
    rollbacks: RollbackRecord[];
    fatal: {
        reason: string;
        at: string;
    } | null;
};
export declare function initialState(): HarnessState;
export declare function loadState(root: string): Promise<HarnessState>;
export declare function saveState(root: string, state: HarnessState): Promise<void>;
export declare function newMilestoneRuntime(milestone: string, baseCommit: string): MilestoneRuntime;
export declare function assertPlanMutable(state: HarnessState): void;
export declare function withLock<T>(root: string, action: () => Promise<T>): Promise<T>;

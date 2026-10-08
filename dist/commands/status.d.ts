import type { ReviewIssue } from '../review/issues.js';
import type { Phase, RetryState } from '../state/state.js';
export type StatusReport = {
    projectStatus: 'draft' | 'active' | 'complete';
    checkpoint: string | null;
    milestone: string | null;
    phase: Phase;
    completedMilestones: string[];
    remainingMilestones: string[];
    reviewIssues: ReviewIssue[];
    scenario: string | null;
    retry: RetryState | null;
    rollbackCount: number;
    fatal: string | null;
};
export declare function collectStatus(root: string): Promise<StatusReport>;
export declare function formatStatus(report: StatusReport): string;

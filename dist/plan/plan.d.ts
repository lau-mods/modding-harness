import type { ProjectSpec } from '../spec/types.js';
import type { CheckpointRecord } from '../state/state.js';
export type Milestone = {
    id: string;
    acIds: string[];
    dependsOn: string[];
    summary: string;
    scope: string[];
    e2eSummary: string;
};
export type Plan = {
    specHash: string;
    createdAt: string;
    milestones: Milestone[];
    excluded: {
        acId: string;
        reason: string;
    }[];
};
export declare function loadPlan(root: string): Promise<Plan | null>;
export declare function savePlan(root: string, plan: Plan): Promise<void>;
export declare function checkPlan(plan: Plan, spec: ProjectSpec): string[];
export declare function milestoneId(index: number): string;
export declare function nextMilestone(plan: Plan, checkpoints: CheckpointRecord[]): Milestone | null;

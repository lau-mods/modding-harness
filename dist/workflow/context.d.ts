import type { AgentCall } from '../agents/agent.js';
import type { HarnessConfig } from '../config/config.js';
import type { IntegrityBaseline } from '../core/integrity.js';
import type { Runner } from '../core/process.js';
import type { ProjectSpec } from '../spec/types.js';
import type { HarnessState, Phase } from '../state/state.js';
export type WorkflowContext = {
    root: string;
    config: HarnessConfig;
    spec: ProjectSpec;
    state: HarnessState;
    runner: Runner;
    baseline: IntegrityBaseline;
};
export declare function openContext(root: string, runner?: Runner): Promise<WorkflowContext>;
export declare function enterPhase(ctx: WorkflowContext, phase: Phase): Promise<void>;
export declare function guardIntegrity(ctx: WorkflowContext): Promise<void>;
export declare function agentCall(ctx: WorkflowContext, agent: 'implementation' | 'review', logDir: string): AgentCall;
export declare function retrying<T>(ctx: WorkflowContext, operation: string, action: (logDir: string) => Promise<T>): Promise<T>;

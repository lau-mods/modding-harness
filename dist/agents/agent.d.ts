import type { AgentConfig } from '../config/config.js';
import { ExecutionFailure, FatalError } from '../core/errors.js';
import type { ProcessResult, Runner } from '../core/process.js';
export type AgentRole = 'implementation' | 'plan' | 'spec_edit' | 'code_review' | 'code_recheck' | 'visual_review' | 'visual_recheck';
export type JsonSchema = Record<string, unknown>;
export type AgentCall = {
    config: AgentConfig;
    root: string;
    logDir: string;
    runner: Runner;
};
export type AgentRequest = {
    role: AgentRole;
    prompt: string;
    images: string[];
    sessionId: string | null;
};
export type AgentResult<T> = {
    output: T;
    sessionId: string | null;
};
export declare const AGENT_TIMEOUT_MS: number;
export declare function outputSchema(role: AgentRole): JsonSchema;
export declare function validateOutput<T>(role: AgentRole, value: unknown): T;
export declare function classifyAgentFailure(role: AgentRole, result: ProcessResult): FatalError | ExecutionFailure;

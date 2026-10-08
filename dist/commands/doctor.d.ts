import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
export type Diagnostic = {
    name: string;
    status: 'ok' | 'missing' | 'misconfigured';
    detail: string;
};
export declare function doctor(root: string, runner?: Runner): Promise<Diagnostic[]>;
export declare function checkAgentAuth(root: string, config: HarnessConfig, runner: Runner): Promise<Diagnostic[]>;
export declare function checkRuntime(root: string, config: HarnessConfig, runner: Runner): Promise<Diagnostic[]>;

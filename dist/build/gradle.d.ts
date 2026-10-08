import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
export type BuildStep = 'compile' | 'build';
export type BuildResult = {
    step: BuildStep;
    success: boolean;
    logDir: string;
    summary: string;
};
export declare function runGradle(root: string, config: HarnessConfig, step: BuildStep, logDir: string, runner: Runner): Promise<BuildResult>;
export declare function compileAndBuild(root: string, config: HarnessConfig, logDir: string, runner: Runner): Promise<BuildResult>;
export declare function findModJar(root: string): Promise<string>;

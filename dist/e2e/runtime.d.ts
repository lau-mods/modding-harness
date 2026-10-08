import type { RuntimeConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
export type RuntimeSession = {
    server: string;
    clients: string[];
    world: string;
    logDir: string;
    startedAt: string;
};
export declare function pilotEnv(root: string): NodeJS.ProcessEnv;
export declare function mcPilot(root: string, config: RuntimeConfig, args: string[], runner: Runner): Promise<unknown>;
export declare function deployMod(root: string, config: RuntimeConfig, modJar: string): Promise<void>;
export declare function startRuntime(root: string, config: RuntimeConfig, logDir: string, runner: Runner): Promise<RuntimeSession>;
export declare function stopRuntime(root: string, config: RuntimeConfig, runner: Runner): Promise<void>;
export declare function launchClients(root: string, config: RuntimeConfig, runner: Runner): Promise<void>;
export declare function stopClients(root: string, config: RuntimeConfig, runner: Runner): Promise<void>;
export declare function startServer(root: string, config: RuntimeConfig, logFile?: string): Promise<void>;
export declare function stopServer(root: string): Promise<void>;
export declare function collectLogs(root: string, session: RuntimeSession): Promise<string[]>;
export declare function scenarioEnv(root: string, config: RuntimeConfig, session: RuntimeSession, scenario: {
    id: string;
    acIds: string[];
}, resultFile: string, screenshotDir: string): NodeJS.ProcessEnv;

export type ProcessResult = {
    code: number;
    stdout: string;
    stderr: string;
    durationMs: number;
};
export type ProcessOptions = {
    cwd: string;
    input?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    logDir?: string;
};
export type Runner = (command: string, args: string[], options: ProcessOptions) => Promise<ProcessResult>;
export declare function run(command: string, args: string[], options: ProcessOptions): Promise<ProcessResult>;
export declare function requireSuccess(result: ProcessResult, operation: string): ProcessResult;
export declare function tail(text: string, length: number): string;

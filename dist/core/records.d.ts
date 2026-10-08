export type ExecutionRecord = {
    operation: string;
    milestone: string | null;
    attempt: number;
    startedAt: string;
    finishedAt: string;
    success: boolean;
    failure: string | null;
    logDir: string;
};
export declare function allocateRunDir(root: string, operation: string, milestone: string | null, attempt: number): Promise<string>;
export declare function writeRecord(record: ExecutionRecord): Promise<void>;
export declare function recordExecution<T>(root: string, operation: string, milestone: string | null, attempt: number, action: (logDir: string) => Promise<T>): Promise<T>;

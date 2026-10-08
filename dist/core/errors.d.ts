export declare class FatalError extends Error {
}
export declare class ExecutionFailure extends Error {
}
export declare class RetryExhausted extends Error {
    readonly operation: string;
    readonly attempts: number;
    readonly lastFailure: ExecutionFailure;
    constructor(operation: string, attempts: number, lastFailure: ExecutionFailure);
}
export declare function toFatal(error: unknown): FatalError;

export declare const MAX_ATTEMPTS = 3;
export type RetryHooks = {
    onAttempt?: (attempt: number) => Promise<void>;
};
export declare function withRetry<T>(operation: string, action: (attempt: number) => Promise<T>, hooks?: RetryHooks): Promise<T>;

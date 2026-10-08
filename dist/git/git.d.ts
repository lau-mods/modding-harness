export declare function git(root: string, args: string[]): Promise<string>;
export declare function head(root: string): Promise<string>;
export declare function isClean(root: string): Promise<boolean>;
export declare function diffFrom(root: string, base: string): Promise<string>;
export declare function changedFilesFrom(root: string, base: string): Promise<string[]>;
export declare function checkpointMessage(milestone: string, acIds: string[]): string;
export declare function createCheckpoint(root: string, milestone: string, acIds: string[]): Promise<string>;
export declare function commitFile(root: string, file: string, message: string): Promise<string>;
export declare function restoreCommit(root: string, commit: string): Promise<void>;

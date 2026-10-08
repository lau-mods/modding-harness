export declare function exists(file: string): Promise<boolean>;
export declare function readJson(file: string): Promise<unknown>;
export declare function writeAtomic(file: string, value: unknown): Promise<void>;
export declare function sha256(value: string | Buffer): string;

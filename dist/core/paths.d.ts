export declare const STATE_DIR = ".harness-state";
export type ProjectPaths = {
    root: string;
    spec: string;
    config: string;
    state: string;
    plan: string;
    lock: string;
    runs: string;
    runtime: string;
};
export declare function projectPaths(root: string): ProjectPaths;
export declare function harnessRoot(): string;

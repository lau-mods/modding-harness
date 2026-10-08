export type IntegrityBaseline = {
    harness: string;
    spec: string;
};
export declare function captureBaseline(root: string): Promise<IntegrityBaseline>;
export declare function assertIntegrity(root: string, baseline: IntegrityBaseline): Promise<void>;

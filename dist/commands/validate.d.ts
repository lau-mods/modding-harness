import type { HarnessConfig } from '../config/config.js';
import type { ProjectSpec } from '../spec/types.js';
export type ValidationReport = {
    spec: ProjectSpec | null;
    config: HarnessConfig | null;
    problems: string[];
};
export declare function validateProject(root: string): Promise<ValidationReport>;

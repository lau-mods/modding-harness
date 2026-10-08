import type { ProjectSpec } from './types.js';
export declare function parseProject(text: string): ProjectSpec;
export declare function readProject(root: string): Promise<ProjectSpec>;

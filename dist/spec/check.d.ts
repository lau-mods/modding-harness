import type { AcceptanceCriterion, ProjectSpec } from './types.js';
export declare function checkStructure(spec: ProjectSpec): string[];
export declare function checkActivation(spec: ProjectSpec): string[];
export declare function requireActionable(spec: ProjectSpec): void;
export declare function activeCriteria(spec: ProjectSpec): AcceptanceCriterion[];
export declare function findCriterion(spec: ProjectSpec, id: string): AcceptanceCriterion | undefined;

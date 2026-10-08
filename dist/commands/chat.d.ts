import type { Runner } from '../core/process.js';
import type { Plan } from '../plan/plan.js';
export declare function chatProject(root: string, request: string, runner?: Runner): Promise<Plan | null>;

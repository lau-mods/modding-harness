import type { Runner } from '../core/process.js';
import type { Plan } from '../plan/plan.js';
import type { WorkflowContext } from '../workflow/context.js';
export declare function planProject(root: string, runner?: Runner): Promise<Plan>;
export declare function createPlan(ctx: WorkflowContext): Promise<Plan>;

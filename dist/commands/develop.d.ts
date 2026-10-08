import { FatalError } from '../core/errors.js';
import type { Runner } from '../core/process.js';
import type { Plan } from '../plan/plan.js';
import type { Phase } from '../state/state.js';
import type { WorkflowContext } from '../workflow/context.js';
export declare function developProject(root: string, runner?: Runner): Promise<Phase>;
export declare function ensurePlan(ctx: WorkflowContext): Promise<Plan>;
export declare function completeProject(ctx: WorkflowContext, plan: Plan): Promise<void>;
export declare function recordFatal(ctx: WorkflowContext, error: FatalError): Promise<void>;

import { assertSafeRelativePath } from '../io.js';
import { validateSchema } from '../schema.js';
import type { ProjectSpec } from '../spec/parser.js';
import type { State } from '../state/state.js';
import { allowedImplementationPath } from '../agents/agents.js';

export type Milestone = { id: string; acIds: string[]; dependsOn: string[]; sourceFiles: string[]; approach: string; testStrategy: string };
export type Plan = { contract: 1; specHash: string; milestones: Milestone[]; blocked: { acId: string; reason: string }[] };
export function validatePlan(value: unknown, spec: ProjectSpec, state: State): Plan {
  const plan = validateSchema<Plan>('plan', value);
  if (plan.specHash !== spec.hash) throw new Error('Plan specHash does not match PROJECT.md');
  const active = new Set(spec.acs.filter(ac => ac.active).map(ac => ac.id));
  const assigned = new Set<string>();
  const milestoneIds = new Set<string>();
  const assign = (id: string): void => {
    if (!active.has(id)) throw new Error(`Plan references unknown/inactive AC: ${id}`);
    if (assigned.has(id)) throw new Error(`AC assigned more than once: ${id}`);
    assigned.add(id);
  };
  for (const milestone of plan.milestones) {
    if (milestoneIds.has(milestone.id) || state.checkpoints.some(cp => cp.milestone === milestone.id)) throw new Error(`Duplicate/reused milestone ${milestone.id}`);
    for (const dep of milestone.dependsOn) if (!milestoneIds.has(dep) && !state.checkpoints.some(cp => cp.milestone === dep)) throw new Error(`Dependency must precede ${milestone.id}: ${dep}`);
    milestoneIds.add(milestone.id);
    for (const id of milestone.acIds) assign(id);
    for (const file of milestone.sourceFiles) {
      assertSafeRelativePath(file);
      if (!allowedImplementationPath(file)) throw new Error(`Plan sourceFiles contains forbidden path: ${file}`);
    }
  }
  for (const item of plan.blocked) assign(item.acId);
  for (const id of active) if (!assigned.has(id) && state.acs[id]?.status !== 'verified') throw new Error(`Unassigned active AC: ${id}`);
  return plan;
}

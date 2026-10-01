import { hash } from '../io.js';
import type { ProjectSpec } from './parser.js';

export function acFingerprint(spec: ProjectSpec, id: string): string {
  const ac = spec.acs.find(item => item.id === id);
  if (!ac) throw new Error(`Unknown AC ${id}`);
  const feature = spec.items.find(item => item.id === ac.parent)!;
  // A feature-level requirement/description change invalidates every AC in that feature.
  const requirements = spec.items.filter(item => item.parent === feature.id && item.kind === 'requirement').map(item => item.source.raw);
  const description = spec.sections.find(section => section.title === 'Description' && section.parent === spec.sections.indexOf(feature.source))!.raw;
  return hash(JSON.stringify([spec.globalHash, feature.title, description, requirements, ac.source.raw]));
}
export function diffSpec(before: ProjectSpec, after: ProjectSpec): { unchanged: string[]; changed: string[]; added: string[]; removed: string[] } {
  const result = { unchanged: [] as string[], changed: [] as string[], added: [] as string[], removed: [] as string[] };
  const old = new Set(before.acs.filter(ac => ac.active).map(ac => ac.id));
  for (const ac of after.acs.filter(ac => ac.active)) {
    if (!old.has(ac.id)) result.added.push(ac.id);
    else (acFingerprint(before, ac.id) === acFingerprint(after, ac.id) ? result.unchanged : result.changed).push(ac.id);
    old.delete(ac.id);
  }
  result.removed.push(...old);
  return result;
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { json, save, VERSION, walk } from '../io.js';
import type { ProjectSpec } from './parser.js';

export function projections(spec: ProjectSpec): Record<string, string> {
  return {
    'index.json': json({ contract: 1, harnessVersion: VERSION, specHash: spec.hash, items: spec.items }),
    'projections/features.md': spec.items.filter(item => item.kind === 'feature').map(item => item.source.raw).join('\n'),
    'projections/acceptance-criteria.md': spec.acs.map(ac => ac.source.raw).join('\n'),
    'projections/testing.json': json(spec.acs.map(ac => ({ id: ac.id, active: ac.active, verification: ac.verification, source: { start: ac.source.start, end: ac.source.end, line: ac.source.line } }))),
    'projections/agent-context.md': spec.text,
  };
}
export async function checkProjections(root: string, spec: ProjectSpec): Promise<void> {
  const dir = path.join(root, '.harness-state/spec'), expected = projections(spec);
  for (const file of await walk(dir)) {
    if (!(file in expected) || await readFile(path.join(dir, file), 'utf8') !== expected[file]) throw new Error(`Projection mismatch: .harness-state/spec/${file}; generated views must not be edited`);
  }
}
export async function materialize(root: string, spec: ProjectSpec): Promise<void> {
  for (const [file, value] of Object.entries(projections(spec))) await save(path.join(root, '.harness-state/spec', file), value);
}
export function agentContext(spec: ProjectSpec, ids: string[]): string {
  const features = new Set(spec.acs.filter(ac => ids.includes(ac.id)).map(ac => ac.parent));
  const sections = spec.sections.filter(section => section.depth === 2 && section.title !== 'Features');
  const selected = spec.items.filter(item => item.kind === 'feature' && features.has(item.id));
  // Exact source excerpts; no paraphrasing and no inferred product constraints.
  return [...sections.map(section => section.raw), ...selected.map(item => item.source.raw)].join('\n');
}

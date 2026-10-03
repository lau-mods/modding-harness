import { loadConfig } from '../config/config.js';
import type { HarnessConfig } from '../config/config.js';
import { checkActivation, checkStructure } from '../spec/check.js';
import { readProject } from '../spec/parser.js';
import type { ProjectSpec } from '../spec/types.js';

// harness validate の結果。読めなかったものは null
export type ValidationReport = { spec: ProjectSpec | null; config: HarnessConfig | null; problems: string[] };

// PROJECT.md の構造・active 条件と .harness-config.json を検査する (§25)
export async function validateProject(root: string): Promise<ValidationReport> {
  const problems: string[] = [];
  const config = await loadConfig(root).catch((error: Error) => { problems.push(error.message); return null; });
  const spec = await readProject(root).catch((error: Error) => { problems.push(error.message); return null; });
  if (spec) {
    problems.push(...checkStructure(spec));
    if (spec.status === 'active') problems.push(...checkActivation(spec));
  }
  return { spec, config, problems };
}

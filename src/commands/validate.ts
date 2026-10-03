import type { HarnessConfig } from '../config/config.js';
import type { ProjectSpec } from '../spec/types.js';

// harness validate の結果。読めなかったものは null
export type ValidationReport = { spec: ProjectSpec | null; config: HarnessConfig | null; problems: string[] };

// PROJECT.md の構造・active 条件と .harness-config.json を検査する (§25)
export async function validateProject(root: string): Promise<ValidationReport> {
  throw new Error('Not implemented');
}

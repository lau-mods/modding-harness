import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { exists, readJson, safePath, save } from '../io.js';
import { validateSchema } from '../schema.js';
import { acFingerprint } from '../spec/diff.js';
import type { ProjectSpec } from '../spec/parser.js';

export type Phase = 'idle' | 'spec_edit' | 'planning' | 'implementation' | 'static' | 'unit' | 'review' | 'build' | 'gametest' | 'e2e' | 'visual' | 'persistence' | 'multiplayer' | 'checkpoint' | 'regression' | 'complete' | 'failed' | 'blocked';
export type AcState = { fingerprint: string; status: 'pending' | 'verified' | 'blocked'; runId: string | null; checkpoint: string | null };
export type Checkpoint = { milestone: string; commit: string; acIds: string[]; specHash: string; runId: string };
export type State = { contract: 1; specHash: string; revision: string; phase: Phase; activeMilestone: string | null; planFile: string | null; acs: Record<string, AcState>; checkpoints: Checkpoint[]; regression: { runId: string; specHash: string; revision: string } | null; reviewFeedback: { milestone: string; runId: string } | null; failure: string | null };
export function newState(spec: ProjectSpec, revision: string): State {
  return { contract: 1, specHash: spec.hash, revision, phase: 'idle', activeMilestone: null, planFile: null,
    acs: Object.fromEntries(spec.acs.filter(ac => ac.active).map(ac => [ac.id, { fingerprint: acFingerprint(spec, ac.id), status: 'pending', runId: null, checkpoint: null }])),
    checkpoints: [], regression: null, reviewFeedback: null, failure: null };
}
export async function loadState(root: string): Promise<State | null> {
  const file = path.join(root, '.harness-state/state.json');
  return await exists(file) ? validateSchema<State>('state', await readJson(file)) : null;
}
export async function saveState(root: string, state: State): Promise<void> {
  validateSchema<State>('state', state);
  await save(path.join(root, '.harness-state/state.json'), state);
}
export function invalidate(state: State, spec: ProjectSpec): void {
  const next = newState(spec, state.revision);
  for (const [id, ac] of Object.entries(next.acs)) {
    const old = state.acs[id];
    if (old && old.fingerprint === ac.fingerprint && old.status === 'verified') next.acs[id] = old;
  }
  Object.assign(state, next, { checkpoints: state.checkpoints });
}
export async function withLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  await safePath(root, '.harness-state');
  await mkdir(path.join(root, '.harness-state'), { recursive: true });
  const file = path.join(root, '.harness-state/lock');
  let handle;
  try { handle = await open(file, 'wx'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Harness is locked; inspect the existing run before manually removing .harness-state/lock'); throw error; }
  try { await handle.writeFile(String(process.pid)); return await action(); }
  finally { await handle.close(); await unlink(file); }
}

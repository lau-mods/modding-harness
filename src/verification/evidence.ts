import { exists, readJson, safePath } from '../io.js';
import { validateSchema } from '../schema.js';
import type { ProjectSpec } from '../spec/parser.js';
import type { VerificationRun } from './verify.js';

export async function validateEvidence(root: string, spec: ProjectSpec, expected: { runId: string; specHash: string; milestone: string; acIds: string[] }, coveredAcIds = expected.acIds): Promise<VerificationRun> {
  const report = validateSchema<VerificationRun>('verification-run', await readJson(await safePath(root, `.harness-state/evidence/${expected.runId}/manifest.json`)));
  if (!report.passed || report.failure !== null || report.specHash !== expected.specHash || report.runId !== expected.runId || report.milestone !== expected.milestone || report.acIds.slice().sort().join() !== expected.acIds.slice().sort().join()) throw new Error('Verification evidence identity/result mismatch');
  const types = new Set(spec.acs.filter(ac => coveredAcIds.includes(ac.id)).flatMap(ac => ac.verification));
  const gates = ['static', 'unit', 'review', 'build', ...(types.has('gametest') ? ['gametest'] : []), ...([...types].some(type => !['unit', 'gametest'].includes(type)) ? ['e2e'] : [])];
  const ordered = ['static', 'unit', 'review', 'build', 'gametest', 'e2e'];
  const actual = report.gates.map(gate => gate.gate);
  if (report.gates.some(gate => !gate.passed) || gates.some(gate => !actual.includes(gate)) || actual.some((gate, i) => !ordered.includes(gate) || (i > 0 && ordered.indexOf(gate) <= ordered.indexOf(actual[i - 1]!)))) throw new Error('Verification evidence has missing/failed/out-of-order gates');
  const review = await readJson(await safePath(root, `.harness-state/reviews/${report.runId}.json`)) as { effectiveReview: unknown; error: unknown };
  const verdict = validateSchema<{ verdict: string; issues: { severity: string }[] }>('review', review.effectiveReview);
  if (review.error !== null || verdict.verdict !== 'pass' || verdict.issues.some(issue => issue.severity !== 'minor')) throw new Error('Verification review evidence is not a pass');
  for (const id of coveredAcIds) {
    const ac = spec.acs.find(ac => ac.id === id);
    if (!ac?.active) continue; // Historical checkpoint may also contain subsequently retired criteria.
    for (const type of ac.verification) {
      const entries = report.evidence.filter(item => item.acId === id && item.verification === type && item.specHash === expected.specHash && item.milestone === expected.milestone);
      if (!entries.length) throw new Error(`Missing verification evidence: ${id}/${type}`);
      for (const item of entries) for (const artifact of item.artifacts) {
        if (!artifact.startsWith(`.harness-state/evidence/${expected.runId}/`) || !await exists(await safePath(root, artifact))) throw new Error(`Missing/out-of-run evidence artifact: ${artifact}`);
      }
    }
  }
  return report;
}

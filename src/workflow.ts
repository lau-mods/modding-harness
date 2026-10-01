import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { allowedImplementationPath, applyChanges, callAgent, sourceContext } from './agents/agents.js';
import { gitFiles, head, localCommit, requireClean, snapshot, verifyIdHistory } from './git/git.js';
import { exists, readJson, save } from './io.js';
import { validatePlan } from './planning/plan.js';
import type { Milestone, Plan } from './planning/plan.js';
import type { Config } from './project/config.js';
import { validateProject } from './project/project.js';
import { run } from './process.js';
import type { Runner } from './process.js';
import { parseProject, requireActionable } from './spec/parser.js';
import type { ProjectSpec } from './spec/parser.js';
import { diffSpec } from './spec/diff.js';
import { agentContext, materialize } from './spec/projector.js';
import { invalidate, loadState, newState, saveState, withLock } from './state/state.js';
import type { Phase, State } from './state/state.js';
import { verify } from './verification/verify.js';
import type { VerificationRun } from './verification/verify.js';
import type { Review } from './agents/agents.js';
import { validateSchema } from './schema.js';
import { validateEvidence } from './verification/evidence.js';

export async function checkpoint(root: string, spec: ProjectSpec, milestone: Milestone, verification: VerificationRun, candidate: string): Promise<string> {
  if (!verification.passed || verification.specHash !== spec.hash || verification.milestone !== milestone.id || verification.acIds.slice().sort().join() !== milestone.acIds.slice().sort().join()) throw new Error('Checkpoint requires a successful verification for this milestone/spec');
  if (await snapshot(root, false) !== candidate) throw new Error('Candidate files/Git changed during verification; refusing checkpoint');
  await validateEvidence(root, spec, { ...verification, acIds: milestone.acIds });
  return localCommit(root, `harness: complete ${milestone.id}\n\nHarness-Milestone: ${milestone.id}\nHarness-Spec-Hash: ${spec.hash}\nHarness-AC: ${milestone.acIds.join(', ')}\nHarness-Verification-Run: ${verification.runId}`);
}

async function openWorkflow(root: string): Promise<{ config: Config; spec: ProjectSpec; state: State }> {
  const { config, spec } = await validateProject(root);
  await requireClean(root);
  const revision = await head(root);
  const state = await loadState(root) ?? newState(spec, revision);
  if (state.revision !== revision) {
    // Any out-of-band committed source change invalidates completion. Historical checkpoints stay intact.
    for (const ac of Object.values(state.acs)) { ac.status = 'pending'; ac.runId = null; ac.checkpoint = null; }
    state.revision = revision; state.planFile = null; state.regression = null; state.phase = 'idle'; state.activeMilestone = null; state.reviewFeedback = null; state.failure = null;
  }
  await materialize(root, spec);
  return { config, spec, state };
}
async function setPhase(root: string, state: State, phase: Phase): Promise<void> {
  state.phase = phase; await saveState(root, state);
  process.stderr.write(`[harness] ${phase}${state.activeMilestone ? ` ${state.activeMilestone}` : ''}\n`);
}
async function fail(root: string, state: State, error: unknown): Promise<never> {
  state.failure = (error as Error).message; state.phase = 'failed'; state.regression = null;
  await saveState(root, state); throw error;
}

async function makePlan(root: string, config: Config, spec: ProjectSpec, state: State, runner: Runner): Promise<Plan> {
  requireActionable(spec);
  state.reviewFeedback = null;
  await setPhase(root, state, 'planning');
  const runId = randomUUID();
  const value = await callAgent(root, config.agents.implementation, 'plan', { project: spec.text, specHash: spec.hash, acs: state.acs, priorCheckpoints: state.checkpoints,
    projectFiles: (await gitFiles(root)).filter(allowedImplementationPath), gradle: config.gradle,
    verificationContract: await readFile(new URL('../docs/verification.md', import.meta.url), 'utf8'),
  }, path.join(root, '.harness-state/runs', `${runId}-plan.json`), runner);
  const plan = validatePlan(value, spec, state);
  for (const ac of Object.values(state.acs)) if (ac.status !== 'verified') ac.status = 'pending';
  for (const item of plan.blocked) state.acs[item.acId]!.status = 'blocked';
  state.planFile = `.harness-state/plans/${runId}.json`;
  await save(path.join(root, state.planFile), plan);
  state.failure = null; await setPhase(root, state, 'idle');
  return plan;
}
export async function planProject(root: string, runner: Runner = run): Promise<Plan> {
  return withLock(root, async () => {
    const { config, spec, state } = await openWorkflow(root);
    try { return await makePlan(root, config, spec, state, runner); }
    catch (error) { return fail(root, state, error); }
  });
}

export async function chatProject(root: string, request: string, runner: Runner = run, referenceFiles: string[] = []): Promise<void> {
  if (!request.trim()) throw new Error('chat requires a product change request');
  return withLock(root, async () => {
    const { config, spec: before, state } = await openWorkflow(root);
    const references = await sourceContext(root, referenceFiles);
    for (const [file, content] of Object.entries(references)) if (content === null) throw new Error(`Missing reference source: ${file}`);
    try {
      await setPhase(root, state, 'spec_edit');
      const runId = randomUUID();
      const result = await callAgent(root, config.agents.implementation, 'spec-edit', { request, project: before.text, references }, path.join(root, '.harness-state/runs', `${runId}-spec.json`), runner) as { projectMarkdown: string };
      const after = parseProject(result.projectMarkdown);
      await verifyIdHistory(root, after);
      if (after.hash === before.hash) { await setPhase(root, state, 'idle'); return; }
      // Persist an invalid proposal only in the agent result; never damage PROJECT.md with malformed output.
      await save(path.join(root, 'PROJECT.md'), after.text);
      await materialize(root, after);
      await save(path.join(root, '.harness-state/runs', `${runId}-spec-diff.json`), diffSpec(before, after));
      invalidate(state, after);
      state.revision = await localCommit(root, `harness(spec): apply product change\n\nHarness-Spec-Hash: ${after.hash}`, ['PROJECT.md']);
      await saveState(root, state);
      await validateProject(root);
      if (after.status === 'active' && after.openQuestions.trim() === 'None.') await makePlan(root, config, after, state, runner);
      else await setPhase(root, state, 'blocked');
    } catch (error) { return fail(root, state, error); }
  });
}

async function fullRegression(root: string, config: Config, spec: ProjectSpec, state: State, runner: Runner): Promise<void> {
  requireActionable(spec);
  const ids = spec.acs.filter(ac => ac.active).map(ac => ac.id);
  if (ids.some(id => state.acs[id]?.status !== 'verified')) throw new Error('Full regression requires verified local checkpoints for every active AC');
  await requireClean(root);
  state.activeMilestone = null; state.regression = null;
  await setPhase(root, state, 'regression');
  const candidate = await snapshot(root, false);
  const milestone: Milestone = { id: 'regression', acIds: ids, dependsOn: [], sourceFiles: [], approach: 'Reverify current PROJECT.md', testStrategy: 'All required verification types, batched' };
  const result = await verify(root, config, spec, milestone, phase => setPhase(root, state, phase), runner);
  if (!result.passed || candidate !== await snapshot(root, false)) {
    for (const ac of Object.values(state.acs)) { ac.status = 'pending'; ac.runId = null; ac.checkpoint = null; }
    state.planFile = null;
    throw new Error(`Regression failed; create new corrective milestones. ${result.failure ?? 'Candidate changed during regression'}`);
  }
  state.regression = { runId: result.runId, specHash: spec.hash, revision: await head(root) };
  state.failure = null; await setPhase(root, state, 'complete');
}

export async function developProject(root: string, runner: Runner = run): Promise<void> {
  return withLock(root, async () => {
    const { config, spec, state } = await openWorkflow(root);
    try {
      requireActionable(spec);
      let plan: Plan;
      if (state.planFile) {
        // Completed milestone IDs are excluded before validating remaining work.
        const original = validateSchema<Plan>('plan', await readJson(path.join(root, state.planFile)));
        plan = validatePlan({ ...original, milestones: original.milestones.filter(ms => !state.checkpoints.some(cp => cp.milestone === ms.id)),
          blocked: original.blocked.filter(item => state.acs[item.acId]?.status !== 'verified') }, spec, state);
      } else plan = await makePlan(root, config, spec, state, runner);
      for (const milestone of plan.milestones) {
        await requireClean(root);
        state.activeMilestone = milestone.id; state.regression = null;
        // One bounded repair after structured code-review feedback; deterministic failures stop immediately.
        for (let attempt = 0; attempt < 2; attempt++) {
          await setPhase(root, state, 'implementation');
          const previousReview = state.reviewFeedback?.milestone === milestone.id
            ? (await readJson(path.join(root, '.harness-state/reviews', `${state.reviewFeedback.runId}.json`)) as { result: Review }).result : null;
          const changes = await callAgent(root, config.agents.implementation, 'implementation', {
            specification: agentContext(spec, milestone.acIds), milestone, sources: await sourceContext(root, [...milestone.sourceFiles, 'tests/verification.json', 'tests/e2e/manifest.json']), previousReview,
            verificationContract: await readFile(new URL('../docs/verification.md', import.meta.url), 'utf8'),
          }, path.join(root, '.harness-state/runs', `${randomUUID()}-implementation.json`), runner);
          await applyChanges(root, changes);
          const candidate = await snapshot(root, false);
          const result = await verify(root, config, spec, milestone, phase => setPhase(root, state, phase), runner);
          if (!result.passed) {
            const reviewFile = path.join(root, '.harness-state/reviews', `${result.runId}.json`);
            if (result.gates.at(-1)?.gate === 'review' && await exists(reviewFile)) {
              const review = await readJson(reviewFile) as { result: Review | null; error: string | null };
              if (!review.error && review.result?.verdict === 'changes_required') {
                state.reviewFeedback = { milestone: milestone.id, runId: result.runId };
                await saveState(root, state);
                if (attempt === 0) continue;
              }
            }
            throw new Error(`Milestone ${milestone.id} failed: ${result.failure}; evidence ${result.runId}`);
          }
          await setPhase(root, state, 'checkpoint');
          const commit = await checkpoint(root, spec, milestone, result, candidate);
          state.checkpoints.push({ milestone: milestone.id, commit, acIds: milestone.acIds, specHash: spec.hash, runId: result.runId });
          for (const id of milestone.acIds) Object.assign(state.acs[id]!, { status: 'verified', runId: result.runId, checkpoint: commit });
          state.revision = commit; state.activeMilestone = null; state.failure = null; state.reviewFeedback = null;
          await saveState(root, state);
          break;
        }
      }
      if (Object.values(state.acs).some(ac => ac.status !== 'verified')) { await setPhase(root, state, 'blocked'); return; }
      await fullRegression(root, config, spec, state, runner);
    } catch (error) { return fail(root, state, error); }
  });
}
export async function regressionProject(root: string, runner: Runner = run): Promise<void> {
  return withLock(root, async () => {
    const { config, spec, state } = await openWorkflow(root);
    try { await fullRegression(root, config, spec, state, runner); }
    catch (error) { return fail(root, state, error); }
  });
}

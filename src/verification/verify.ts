import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { git } from '../git/git.js';
import { save } from '../io.js';
import { run, success } from '../process.js';
import type { Runner } from '../process.js';
import type { Config } from '../project/config.js';
import { gradleTasks } from '../project/project.js';
import type { ProjectSpec } from '../spec/parser.js';
import { agentContext } from '../spec/projector.js';
import { allowedImplementationPath, callAgent, sourceContext } from '../agents/agents.js';
import type { Review } from '../agents/agents.js';
import type { Milestone } from '../planning/plan.js';
import type { Phase } from '../state/state.js';
import { validateResources } from './static.js';
import { checkReports, clearReports, loadTestMappings } from './reports.js';
import { loadScenarios, runRuntime, ScenarioError } from './e2e.js';
import type { Evidence } from './e2e.js';

export type VerificationRun = { contract: 1; runId: string; specHash: string; milestone: string; acIds: string[]; passed: boolean; gates: { gate: string; passed: boolean }[]; evidence: Evidence[]; failure: string | null };
export async function verify(root: string, config: Config, spec: ProjectSpec, milestone: Milestone, phase: (phase: Phase) => Promise<void>, runner: Runner = run): Promise<VerificationRun> {
  const runId = randomUUID(), dir = path.join(root, '.harness-state/evidence', runId);
  const report: VerificationRun = { contract: 1, runId, specHash: spec.hash, milestone: milestone.id, acIds: milestone.acIds, passed: false, gates: [], evidence: [], failure: null };
  let e2eExecutionError: unknown;
  await mkdir(dir, { recursive: true });
  const types = new Set(spec.acs.filter(ac => milestone.acIds.includes(ac.id)).flatMap(ac => ac.verification));
  const gate = async (name: Phase, action: () => Promise<void>): Promise<void> => {
    await phase(name);
    const entry = { gate: name, passed: false }; report.gates.push(entry);
    await action(); entry.passed = true;
    await save(path.join(dir, 'manifest.json'), report);
  };
  const gradle = async (name: string, task: string): Promise<void> => {
    const result = await runner(path.join(root, 'gradlew'), [task, ...(['unit', 'gametest'].includes(name) ? ['--rerun-tasks'] : []), '--console=plain', '--no-daemon'], { cwd: root });
    await save(path.join(dir, `${name}-process.json`), result); success(result, `Gradle ${task}`);
  };
  try {
    const tasks = await gradleTasks(root, runner);
    const required = [config.gradle.compile, config.gradle.test, config.gradle.build, ...(types.has('gametest') ? [config.gradle.gameTest] : [])];
    for (const task of required) if (!task || !tasks.has(task)) throw new Error(`Missing required Gradle task: ${task ?? 'gameTest (not configured)'}`);
    const mappings = await loadTestMappings(root, spec);
    const testGate = async (type: 'unit' | 'gametest', task: string): Promise<void> => {
      const applicable = mappings.filter(test => test.type === type);
      await clearReports(root, applicable);
      await gradle(type, task);
      const ids = milestone.acIds.filter(id => spec.acs.find(ac => ac.id === id)!.verification.includes(type));
      for (const result of await checkReports(root, applicable, ids, type)) {
        const artifacts = [];
        for (const [index, file] of result.reports.entries()) {
          const destination = path.join(dir, `${result.acId}-${type}-${index}.xml`);
          await copyFile(path.join(root, file), destination); artifacts.push(path.relative(root, destination));
        }
        report.evidence.push({ acId: result.acId, specHash: spec.hash, milestone: milestone.id, verification: type, result: 'passed', artifacts });
      }
    };
    await gate('static', async () => { await validateResources(root); await gradle('compile', config.gradle.compile); });
    await gate('unit', () => testGate('unit', config.gradle.test));
    await gate('review', async () => {
      const files = [...new Set([...milestone.sourceFiles,
        ...(await git(root, ['diff', '--name-only', '-z', 'HEAD'])).split('\0').filter(allowedImplementationPath),
        ...(await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(allowedImplementationPath),
        ...['tests/verification.json', 'tests/e2e/manifest.json']])];
      const review = await callAgent(root, config.agents.review, 'review', { specification: agentContext(spec, milestone.acIds), milestone,
        diff: await git(root, ['diff', '--no-ext-diff', '--no-textconv', 'HEAD']), sources: await sourceContext(root, files) }, path.join(root, '.harness-state/reviews', `${runId}.json`), runner) as Review;
      if (review.verdict !== 'pass') throw new Error(`Independent review requires changes; see .harness-state/reviews/${runId}.json`);
    });
    await gate('build', () => gradle('build', config.gradle.build));
    if (types.has('gametest')) await gate('gametest', () => testGate('gametest', config.gradle.gameTest!));
    if ([...types].some(type => !['unit', 'gametest'].includes(type))) await gate('e2e', async () => {
      for (let attempt = 0; ; attempt++) {
        const attemptDir = attempt === 0 ? dir : path.join(dir, 'e2e-retry');
        try {
          const scenarios = await loadScenarios(root, spec);
          report.evidence.push(...await runRuntime(root, config, spec, milestone.acIds, milestone.id, runId, attemptDir, scenarios, phase, runner));
          return;
        } catch (error) {
          const scenario = error instanceof ScenarioError;
          await save(path.join(attemptDir, 'e2e-failure.json'), { scenario, message: (error as Error).message });
          if (scenario || attempt === 1) throw error;
          process.stderr.write('[harness] Retrying E2E only (2/2)\n');
        }
      }
    });
    for (const id of milestone.acIds) for (const type of spec.acs.find(ac => ac.id === id)!.verification) {
      if (!report.evidence.some(item => item.acId === id && item.verification === type && item.result === 'passed')) throw new Error(`Missing required evidence ${id}/${type}`);
    }
    report.passed = true;
  } catch (error) {
    report.failure = (error as Error).message;
    if (report.gates.at(-1)?.gate === 'e2e' && !(error instanceof ScenarioError)) e2eExecutionError = error;
  }
  for (const id of milestone.acIds) await save(path.join(dir, id, 'result.json'), { acId: id, specHash: spec.hash, milestone: milestone.id, passed: report.passed, evidence: report.evidence.filter(item => item.acId === id), failure: report.failure });
  await save(path.join(dir, 'manifest.json'), report);
  // Execution errors stop the workflow without invalidating verified ACs for corrective implementation.
  if (e2eExecutionError) throw e2eExecutionError;
  return report;
}

import { copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { exists, readJson, safePath, save } from '../io.js';
import { run, success } from '../process.js';
import type { Runner } from '../process.js';
import { validateSchema } from '../schema.js';
import type { ProjectSpec, Verification } from '../spec/parser.js';
import type { Config } from '../project/config.js';
import { callAgent } from '../agents/agents.js';
import type { Review } from '../agents/agents.js';
import { McPilot, pilotEnv } from '../runtime/mc-pilot.js';

export type Scenario = { id: string; acIds: string[]; verification: Verification[]; command: string[] };
type Assertion = { name: string; passed: boolean; observed: string };
export type ScenarioResult = { contract: 1; scenarioId: string; runId: string; stage: string; passed: boolean; assertions: Assertion[]; screenshots: { acId: string; path: string }[];
  persistence: { worldId: string; saved: boolean; reloaded: boolean } | null;
  multiplayer: { actorClient: string; observerClient: string; serverAssertion: Assertion; observerAssertion: Assertion } | null };
export type Evidence = { acId: string; specHash: string; milestone: string; verification: Verification; result: 'passed'; artifacts: string[] };

export async function loadScenarios(root: string, spec: ProjectSpec): Promise<Scenario[]> {
  const file = await safePath(root, 'tests/e2e/manifest.json');
  if (!await exists(file)) return [];
  const manifest = validateSchema<{ contract: 1; scenarios: Scenario[] }>('e2e-manifest', await readJson(file));
  const ids = new Set<string>();
  for (const scenario of manifest.scenarios) {
    if (ids.has(scenario.id)) throw new Error(`Duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);
    for (const id of scenario.acIds) {
      const ac = spec.acs.find(ac => ac.id === id && ac.active);
      if (!ac || !scenario.verification.some(type => ac.verification.includes(type))) throw new Error(`Scenario ${scenario.id} references unknown/incompatible AC: ${id}`);
    }
  }
  return manifest.scenarios;
}

export async function runRuntime(root: string, config: Config, spec: ProjectSpec, acIds: string[], milestone: string, runId: string, dir: string, scenarios: Scenario[], phase: (phase: 'e2e' | 'visual' | 'persistence' | 'multiplayer') => Promise<void>, runner: Runner = run): Promise<Evidence[]> {
  const runtime = new McPilot(root, config.runtime, dir, runner);
  const evidence: Evidence[] = [];
  const selected = scenarios.filter(scenario => scenario.acIds.some(id => acIds.includes(id)));
  for (const id of acIds) for (const type of spec.acs.find(ac => ac.id === id)!.verification.filter(type => type !== 'unit' && type !== 'gametest')) {
    if (!selected.some(scenario => scenario.acIds.includes(id) && scenario.verification.includes(type))) throw new Error(`Missing E2E scenario coverage: ${id}/${type}`);
  }
  const execute = async (scenario: Scenario, stage: 'execute' | 'setup' | 'assert', generation: string): Promise<ScenarioResult> => {
    const resultFile = path.join(dir, `${scenario.id}-${stage}.json`);
    if (await exists(resultFile)) throw new Error(`Refusing stale scenario result: ${resultFile}`);
    const execution = await runner(scenario.command[0]!, scenario.command.slice(1), { cwd: root, env: {
      ...pilotEnv(root), HARNESS_RESULT_PATH: resultFile, HARNESS_EVIDENCE_DIR: dir, HARNESS_RUN_ID: runId,
      HARNESS_SCENARIO_ID: scenario.id, HARNESS_STAGE: stage, HARNESS_RUNTIME_GENERATION: generation,
      HARNESS_AC_IDS: JSON.stringify(scenario.acIds), HARNESS_MCT_COMMAND: config.runtime.command,
      HARNESS_CLIENTS: JSON.stringify(config.runtime.clients),
    } });
    await save(path.join(dir, `${scenario.id}-${stage}-process.json`), execution);
    success(execution, `E2E ${scenario.id}/${stage}`);
    const result = validateSchema<ScenarioResult>('scenario-result', await readJson(resultFile));
    if (result.scenarioId !== scenario.id || result.runId !== runId || result.stage !== stage || !result.passed || result.assertions.some(assertion => !assertion.passed)) throw new Error(`Scenario assertions failed or identity mismatch: ${scenario.id}/${stage}`);
    return result;
  };
  let failure: unknown;
  try {
    let generation = await runtime.start();
    for (const scenario of selected) {
      await phase('e2e');
      let result: ScenarioResult;
      if (scenario.verification.includes('persistence')) {
        await phase('persistence');
        const setup = await execute(scenario, 'setup', generation);
        if (!setup.persistence?.saved) throw new Error(`${scenario.id} persistence setup must save world state`);
        await runtime.stop();
        const previous = generation;
        generation = await runtime.start();
        if (previous === generation) throw new Error('Persistence verification requires a new process generation');
        result = await execute(scenario, 'assert', generation);
        if (!result.persistence?.reloaded || result.persistence.worldId !== setup.persistence.worldId) throw new Error(`${scenario.id} did not reload the saved world`);
      } else result = await execute(scenario, 'execute', generation);
      if (scenario.verification.includes('multiplayer')) {
        await phase('multiplayer');
        const mp = result.multiplayer;
        if (!mp || mp.actorClient === mp.observerClient || !config.runtime.clients.includes(mp.actorClient) || !config.runtime.clients.includes(mp.observerClient) || !mp.serverAssertion.passed || !mp.observerAssertion.passed) throw new Error(`${scenario.id} requires Client A action, server assertion, and distinct Client B observation`);
      }
      for (const id of scenario.acIds.filter(id => acIds.includes(id))) {
        const ac = spec.acs.find(ac => ac.id === id)!;
        for (const type of scenario.verification.filter(type => ac.verification.includes(type))) {
          const artifacts = [path.relative(root, path.join(dir, `${scenario.id}-${result.stage}.json`))];
          if (type === 'visual') {
            await phase('visual');
            const shots = result.screenshots.filter(shot => shot.acId === id);
            if (!shots.length) throw new Error(`Visual AC ${id} has no screenshot`);
            const images: string[] = [];
            for (const [index, shot] of shots.entries()) {
              const source = await safePath(dir, shot.path);
              const bytes = await readFile(source);
              if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Screenshot must be PNG: ${shot.path}`);
              const destination = path.join(dir, `${id}-${scenario.id}-${index}.png`);
              await copyFile(source, destination); images.push(destination); artifacts.push(path.relative(root, destination));
            }
            const reviewFile = path.join(dir, `${id}-${scenario.id}-visual.json`);
            const review = await callAgent(root, config.agents.review, 'visual', { ac: ac.source.raw, observations: result.assertions, screenshots: images.map((_, i) => `screenshot-${i + 1}.png`) }, reviewFile, runner, images) as Review;
            if (review.verdict !== 'pass') throw new Error(`Visual review failed: ${id}`);
            artifacts.push(path.relative(root, reviewFile));
          }
          evidence.push({ acId: id, specHash: spec.hash, milestone, verification: type, result: 'passed', artifacts });
        }
      }
    }
  } catch (error) { failure = error; }
  finally {
    try { await runtime.stop(); }
    catch (error) {
      const errors = [failure, error].filter(Boolean) as Error[];
      failure = new AggregateError(errors, errors.map(item => item.message).join('; '));
    }
  }
  if (failure) throw failure;
  await runtime.scanLogs();
  return evidence;
}

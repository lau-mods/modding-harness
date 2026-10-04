import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { chatProject } from '../dist/commands/chat.js';
import { developProject } from '../dist/commands/develop.js';
import { planProject } from '../dist/commands/plan.js';
import { collectStatus } from '../dist/commands/status.js';
import { FatalError } from '../dist/core/errors.js';
import { PLAN, SPEC, implementationFiles, setupProject } from './helpers.mjs';

const finding = (title, file = 'src/Main.java') => ({ title, detail: `${title} detail`, file, line: 1 });

test('develop runs build, review, E2E and visual loops until the checkpoint', async () => {
  const project = setupProject({
    claude: {
      plan: [{ output: PLAN }],
      code_review: [{ output: { findings: [finding('Missing registration')] } }],
      code_recheck: [{ output: { verdicts: [{ issueId: 'CR-001', status: 'resolved', note: 'Registered' }] } }],
      visual_review: [{ output: { findings: [finding('Texture looks flat', null)] } }],
    },
    codex: [
      { files: implementationFiles({ 'src/BROKEN': 'x' }) },
      { files: { 'src/BROKEN': null } },
      { output: { summary: 'Registered', changedFiles: ['src/Main.java'], responses: [{ issueId: 'CR-001', decision: 'fixed', reason: 'Added registration' }] } },
      { files: { 'src/FEATURE_OK': 'yes' } },
      { output: { summary: 'Kept texture', changedFiles: [], responses: [{ issueId: 'VR-001', decision: 'accepted', reason: 'The flat texture is the intended art style' }] } },
    ],
  });

  assert.equal(await developProject(project.root), 'complete');

  const codex = project.calls().filter(call => call.agent === 'codex');
  assert.equal(codex.length, 5);
  assert.match(codex[1].prompt, /Build failure \(compile\)[\s\S]*cannot find symbol/);
  assert.match(codex[2].prompt, /CR-001/);
  assert.match(codex[3].prompt, /E2E failure[\s\S]*feature_enabled/);
  assert.match(codex[4].prompt, /VR-001/);

  const reviews = project.calls().filter(call => call.agent === 'claude');
  assert.deepEqual(reviews.map(call => call.role), ['plan', 'code_review', 'code_recheck', 'visual_review']);
  assert.match(reviews[2].resume, /^session-code_review-/);

  const message = project.git('log', '-1', '--format=%B');
  assert.match(message, /Harness-Milestone: M01/);
  assert.match(message, /Harness-AC: AC-F001-001, AC-F001-002/);
  assert.equal(project.git('status', '--porcelain'), '');

  const state = project.harnessState();
  assert.equal(state.phase, 'complete');
  assert.equal(state.planLocked, false);
  assert.equal(state.checkpoints.length, 1);
  assert.equal(state.rollbacks.length, 0);

  const mct = project.mctLog();
  assert.ok(mct.some(line => /^client launch harness-a --server 127\.0\.0\.1:25599 --ws-port \d+ --account harness_a --force$/.test(line)));
  assert.ok(mct.some(line => line.startsWith('client wait-ready harness-a')));
  assert.ok(mct.some(line => line.startsWith('--client harness-a screenshot')));
  assert.ok(mct.some(line => line === '--client harness-a status world'), 'preflight and the scenario read the world state');
  assert.ok(mct.some(line => line === 'client stop harness-a'));
  const server = JSON.parse(readFileSync(path.join(project.root, '.harness-state/runtime/server.json'), 'utf8'));
  assert.equal(server.pid, null);
  const serverLog = readFileSync(server.logFile, 'utf8');
  assert.equal(serverLog.match(/Done \(/g).length, 2, 'scenario restarts the server through HARNESS_SERVER_CONTROL');
  assert.match(serverLog, /Preparing level "harness-world"/);
  assert.ok(existsSync(path.join(project.root, '.harness-state/runtime/server/mods/testmod-1.0.jar')));
});

test('develop rolls back to the checkpoint after three scenario process failures', async () => {
  const project = setupProject({
    claude: {
      plan: [{ output: PLAN }],
      code_review: [{ output: { findings: [] } }, { output: { findings: [] } }],
      visual_review: [{ output: { findings: [] } }],
    },
    codex: [
      { files: implementationFiles({ 'src/FEATURE_OK': 'yes' }) },
      { files: implementationFiles({ 'src/FEATURE_OK': 'yes' }) },
    ],
  }, { scenarioFailures: 3 });
  assert.equal(await developProject(project.root), 'complete');
  const base = project.git('rev-parse', 'HEAD~1').trim();

  const state = project.harnessState();
  assert.equal(state.rollbacks.length, 1);
  assert.equal(state.rollbacks[0].operation, 'e2e');
  assert.equal(state.rollbacks[0].restoredTo, base);
  assert.equal(project.calls().filter(call => call.agent === 'codex').length, 2);
  assert.equal(project.calls().filter(call => call.role === 'code_review').length, 2, 'the review issue set starts over after rollback');
});

test('develop stops with fatal when PROJECT.md changes during implementation', async () => {
  const project = setupProject({
    claude: { plan: [{ output: PLAN }] },
    codex: [{ files: { 'PROJECT.md': SPEC.replace('The feature is enabled.', 'The feature is disabled.') } }],
  });

  await assert.rejects(developProject(project.root), error => error instanceof FatalError && /PROJECT\.md was modified/.test(error.message));
  const state = project.harnessState();
  assert.equal(state.phase, 'fatal');
  assert.match(state.fatal.reason, /PROJECT\.md/);
  assert.equal((await collectStatus(project.root)).fatal, state.fatal.reason);
});

test('develop completes when the plan excludes criteria from E2E', async () => {
  const project = setupProject({
    claude: {
      plan: [{ output: { milestones: [{ ...PLAN.milestones[0], acIds: ['AC-F001-001'] }], excluded: [{ acId: 'AC-F001-002', reason: 'Block textures are rendered by Minecraft' }] } }],
      code_review: [{ output: { findings: [] } }],
      visual_review: [{ output: { findings: [] } }],
    },
    codex: [{ files: implementationFiles({ 'src/FEATURE_OK': 'yes' }) }],
  });

  assert.equal(await developProject(project.root), 'complete');
  assert.match(project.git('log', '-1', '--format=%B'), /Harness-AC: AC-F001-001\n/);
  assert.deepEqual(JSON.parse(readFileSync(path.join(project.root, '.harness-plan.json'), 'utf8')).excluded.map(item => item.acId), ['AC-F001-002']);
});

test('develop reruns only the scenarios that have not passed', async () => {
  const manifest = JSON.stringify({ scenarios: [
    { id: 'stable', acIds: ['AC-F001-002'], command: ['node', 'tests/e2e/scenarios/main.mjs'] },
    { id: 'main', acIds: ['AC-F001-001'], command: ['node', 'tests/e2e/scenarios/main.mjs'] },
  ] });
  const project = setupProject({
    claude: { plan: [{ output: PLAN }], code_review: [{ output: { findings: [] } }], visual_review: [{ output: { findings: [] } }] },
    codex: [{ files: implementationFiles({ 'tests/e2e/manifest.json': manifest }) }, { files: { 'src/FEATURE_OK': 'yes' } }],
  });

  assert.equal(await developProject(project.root), 'complete');
  const runs = path.join(project.root, '.harness-state/runs');
  const executed = id => readdirSync(runs).filter(run => run.includes('-e2e-') && existsSync(path.join(runs, run, 'scenarios', id))).length;
  assert.equal(executed('stable'), 1);
  assert.equal(executed('main'), 2);
  assert.match(project.calls().filter(call => call.agent === 'codex')[1].prompt, /already passed and are final[\s\S]*"stable"/);
});

test('develop stops with fatal before planning when preflight fails', async () => {
  const project = setupProject({ claude: { plan: [{ output: PLAN }] } });
  writeFileSync(path.join(project.root, '.harness-state/runtime/server/eula.txt'), 'eula=false\n');

  await assert.rejects(developProject(project.root), error => error instanceof FatalError && /Preflight failed at "start server and clients"[\s\S]*EULA/.test(error.message));
  assert.equal(project.harnessState().phase, 'fatal');
  assert.deepEqual(project.calls(), []);
});

test('chat updates PROJECT.md, commits it and replans', async () => {
  const updated = SPEC.replace('## Cross-cutting Requirements', `##### AC-F001-003: Feature can be disabled

Preconditions:
The feature is enabled.

Action:
The player disables the feature.

Expected Result:
The feature is disabled.

## Cross-cutting Requirements`);
  const plan = { milestones: [PLAN.milestones[0], { id: 'M02', acIds: ['AC-F001-003'], dependsOn: ['M01'], summary: 'Disable', scope: ['src/'], e2eSummary: 'Disable scenario' }], excluded: [] };
  const project = setupProject({
    claude: {
      plan: [{ output: PLAN }, { output: plan }],
      spec_edit: [{ output: { projectMarkdown: updated, summary: 'Add disabling the feature' } }],
    },
  });

  assert.equal((await planProject(project.root)).milestones.length, 1);
  const result = await chatProject(project.root, 'Players can disable the feature');
  assert.deepEqual(result.milestones.map(milestone => milestone.id), ['M01', 'M02']);
  assert.equal(readFileSync(path.join(project.root, 'PROJECT.md'), 'utf8'), updated);
  assert.deepEqual(project.git('log', '-3', '--format=%s').trim().split('\n'), ['plan: M01, M02', 'spec: Add disabling the feature', 'plan: M01']);
});

test('chat is refused while the plan is fixed', async () => {
  const project = setupProject({});
  const file = path.join(project.root, '.harness-state', 'state.json');
  writeFileSync(file, JSON.stringify({ phase: 'fatal', planLocked: true, currentMilestone: 'M01', checkpoints: [], milestone: null, retry: null, rollbacks: [], fatal: null }));
  await assert.rejects(chatProject(project.root, 'Change something'), /plan is fixed/);
});

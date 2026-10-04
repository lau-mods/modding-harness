import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateOutput } from '../dist/agents/agent.js';
import { ExecutionFailure, RetryExhausted } from '../dist/core/errors.js';
import { withRetry } from '../dist/core/retry.js';
import { checkPlan, milestoneId } from '../dist/plan/plan.js';
import { applyResponses, applyVerdicts, createIssueSet, isSettled } from '../dist/review/issues.js';
import { activeCriteria, checkActivation, checkStructure } from '../dist/spec/check.js';
import { parseProject } from '../dist/spec/parser.js';
import { PLAN, SPEC } from './helpers.mjs';

test('the PROJECT.md template parses as a draft without features', () => {
  const spec = parseProject(readFileSync(new URL('../templates/PROJECT.md', import.meta.url), 'utf8'));
  assert.equal(spec.status, 'draft');
  assert.deepEqual(spec.features, []);
  assert.deepEqual(checkStructure(spec), []);
  assert.ok(checkActivation(spec).includes('Open Questions must be resolved (write "None.")'));
});

test('an active PROJECT.md parses features, requirements and criteria', () => {
  const spec = parseProject(SPEC);
  assert.equal(spec.modId, 'testmod');
  assert.equal(spec.platform.neoforge, '21.1.252');
  assert.deepEqual(activeCriteria(spec).map(criterion => criterion.id), ['AC-F001-001', 'AC-F001-002']);
  assert.equal(activeCriteria(spec)[0].expectedResult, 'The feature is enabled.');
  assert.deepEqual([...checkStructure(spec), ...checkActivation(spec)], []);
});

test('retired criteria and invalid IDs are detected', () => {
  const spec = parseProject(SPEC.replace('##### AC-F001-002: Block is textured\n', '##### AC-F001-002: Block is textured\n\nStatus: retired\n').replace('R-F001-001', 'R-F002-001'));
  assert.deepEqual(activeCriteria(spec).map(criterion => criterion.id), ['AC-F001-001']);
  assert.match(checkStructure(spec)[0], /R-F002-001/);
});

test('plans assign every active criterion exactly once in milestone order', () => {
  const spec = parseProject(SPEC);
  assert.deepEqual(checkPlan({ specHash: spec.hash, createdAt: '', ...PLAN }, spec), []);
  const problems = checkPlan({ specHash: spec.hash, createdAt: '', milestones: [{ ...PLAN.milestones[0], id: 'M02', acIds: ['AC-F001-001'] }], excluded: [] }, spec);
  assert.ok(problems.some(problem => problem.includes('ID M01')));
  assert.ok(problems.some(problem => problem.includes('AC-F001-002 is assigned to no milestone')));
  assert.equal(milestoneId(9), 'M10');
  const excluded = { specHash: spec.hash, createdAt: '', milestones: [{ ...PLAN.milestones[0], acIds: ['AC-F001-001'] }], excluded: [{ acId: 'AC-F001-002', reason: 'Owned by Minecraft' }] };
  assert.deepEqual(checkPlan(excluded, spec), []);
});

test('issue sets stay fixed and settle through resolved or accepted', () => {
  let set = createIssueSet('code', 'M01', [{ title: 'A', detail: 'a', file: null, line: null }, { title: 'B', detail: 'b', file: null, line: null }], 'session');
  assert.deepEqual(set.issues.map(issue => issue.id), ['CR-001', 'CR-002']);
  set = applyResponses(set, [{ issueId: 'CR-002', decision: 'accepted', reason: 'Intended behavior' }]);
  set = applyVerdicts(set, [{ issueId: 'CR-001', status: 'unresolved', note: 'still' }, { issueId: 'CR-999', status: 'resolved', note: 'new' }]);
  assert.equal(isSettled(set), false);
  assert.equal(set.issues.length, 2);
  set = applyVerdicts(set, [{ issueId: 'CR-001', status: 'resolved', note: 'ok' }]);
  assert.equal(isSettled(set), true);
  assert.deepEqual(set.issues.map(issue => issue.status), ['resolved', 'accepted']);
});

test('withRetry runs three attempts and then reports RetryExhausted', async () => {
  let attempts = 0;
  await assert.rejects(withRetry('e2e', async () => { attempts++; throw new ExecutionFailure('boom', 'e2e'); }), RetryExhausted);
  assert.equal(attempts, 3);
  assert.equal(await withRetry('e2e', async attempt => { if (attempt < 3) throw new ExecutionFailure('boom', 'e2e'); return attempt; }), 3);
});

test('agent output is validated against the role schema', () => {
  assert.deepEqual(validateOutput('code_recheck', { verdicts: [] }), { verdicts: [] });
  assert.throws(() => validateOutput('code_recheck', { verdicts: [{ issueId: 'CR-001', status: 'done', note: '' }] }), ExecutionFailure);
});

test('the E2E helper unwraps MC Pilot envelopes, records assertions and turns errors into a failed assertion', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'harness-lib-'));
  const env = { ...process.env, FAKE_STATE: dir, HARNESS_MCT: fileURLToPath(new URL('./fixtures/fake-mct.mjs', import.meta.url)), HARNESS_E2E_LIB: fileURLToPath(new URL('../e2e/lib.mjs', import.meta.url)), HARNESS_CLIENTS: '["harness-a"]', HARNESS_SCENARIO_ID: 'lib', HARNESS_SCREENSHOT_DIR: dir };
  const runScenario = (name, body) => {
    const file = path.join(dir, `${name}.mjs`);
    writeFileSync(file, `const { scenario, mct, waitFor, check } = await import(process.env.HARNESS_E2E_LIB);\nawait scenario(async ({ clients }) => {\n${body}\n});\n`);
    const resultFile = path.join(dir, `${name}.json`);
    execFileSync(process.execPath, [file], { env: { ...env, HARNESS_RESULT_FILE: resultFile } });
    return JSON.parse(readFileSync(resultFile, 'utf8'));
  };
  const ok = runScenario('ok', `const world = await waitFor(() => mct(clients[0], 'status', 'world'), world => world.dimension === 'minecraft:overworld');\ncheck('dimension', 'minecraft:overworld', world.dimension);\ncheck('missing', 1, undefined);`);
  assert.equal(ok.scenarioId, 'lib');
  assert.deepEqual(ok.assertions.map(item => [item.name, item.actual, item.passed]), [['dimension', 'minecraft:overworld', true], ['missing', null, false]]);
  assert.equal(ok.passed, false);
  const failed = runScenario('failed', `mct(clients[0], 'fail');`);
  assert.equal(failed.assertions[0].name, 'scenario_error');
  assert.match(failed.assertions[0].actual, /NOT_IN_WORLD/);
  assert.equal(failed.passed, false);
});

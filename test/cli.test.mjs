import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli/main.js', import.meta.url));
const harness = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('init, validate and status work on a new project', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-cli-'));
  assert.equal(harness('init', '--project', root).status, 1);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', fileURLToPath(new URL('..', import.meta.url)), '.harness'], { cwd: root });
  assert.equal(harness('init', '--project', root).status, 0);
  assert.equal(readFileSync(path.join(root, 'PROJECT.md'), 'utf8'), readFileSync(new URL('../templates/PROJECT.md', import.meta.url), 'utf8'));
  assert.equal(JSON.parse(readFileSync(path.join(root, '.harness-config.json'), 'utf8')).agents.review.command, 'claude');
  assert.match(readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\.harness-state\/$/m);

  const validate = harness('validate', '--project', root);
  assert.equal(validate.status, 0);
  assert.match(validate.stdout, /Valid: PROJECT.md is draft/);

  const status = harness('status', '--project', root);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /Project status: +draft/);
  assert.match(status.stdout, /Current phase: +idle/);

  const plan = harness('plan', '--project', root);
  assert.equal(plan.status, 1);
  assert.match(plan.stderr, /fatal: PROJECT.md Status must be active/);
});

test('help lists every command', () => {
  const help = harness('--help');
  for (const command of ['create', 'init', 'doctor', 'validate', 'status', 'chat', 'plan', 'develop', 'server']) assert.match(help.stdout, new RegExp(`harness ${command}`));
});

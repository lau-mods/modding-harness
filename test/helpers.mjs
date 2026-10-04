import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
for (const name of ['fake-agent.mjs', 'fake-mct.mjs', 'fake-gradlew.mjs']) chmodSync(path.join(fixtures, name), 0o755);

export const SPEC = `# Project

Status: active

Project ID: test-project
Mod ID: testmod
Package Path: com.example.testmod

## Platform

Minecraft: 1.21.1
NeoForge: 21.1.252
Java: 21

## Purpose

A mod used by the harness tests.

## Features

### F-001: Feature

#### Description

A feature that players can enable.

#### Requirements

##### R-F001-001: Enable the feature

Players can enable the feature.

#### Acceptance Criteria

##### AC-F001-001: Feature is enabled

Preconditions:
A world exists.

Action:
The player enables the feature.

Expected Result:
The feature is enabled.

##### AC-F001-002: Block is textured

Preconditions:
A feature block is placed.

Action:
The player looks at the block.

Expected Result:
The block shows its texture.

## Cross-cutting Requirements

### Persistence

None.

### Multiplayer

None.

### Visual

None.

### Performance

None.

### Compatibility

None.

## Constraints

None.

## Open Questions

None.
`;

export const PLAN = { milestones: [{ id: 'M01', acIds: ['AC-F001-001', 'AC-F001-002'], dependsOn: [], summary: 'Implement the feature', scope: ['src/'], e2eSummary: 'The main scenario checks the feature and takes a screenshot' }], excluded: [] };

// E2E manifest と scenario を含む実装ファイル一式
export function implementationFiles(extra = {}) {
  return {
    'src/Main.java': 'class Main {}\n',
    'tests/e2e/manifest.json': JSON.stringify({ scenarios: [{ id: 'main', acIds: ['AC-F001-001', 'AC-F001-002'], command: ['node', 'tests/e2e/scenarios/main.mjs'] }] }),
    'tests/e2e/scenarios/main.mjs': readFileSync(path.join(fixtures, 'scenario.mjs'), 'utf8'),
    ...extra,
  };
}

// fake の agent・gradlew・MC Pilot・server を使う一時 project を作る
export function setupProject(script, { scenarioFailures = 0 } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-project-'));
  const state = mkdtempSync(path.join(tmpdir(), 'harness-fake-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'harness@example.com');
  git('config', 'user.name', 'Harness Test');
  writeFileSync(path.join(root, 'PROJECT.md'), SPEC);
  writeFileSync(path.join(root, '.gitignore'), 'build/\n.harness-state/\n');
  copyFileSync(path.join(fixtures, 'fake-gradlew.mjs'), path.join(root, 'gradlew'));
  chmodSync(path.join(root, 'gradlew'), 0o755);
  writeFileSync(path.join(root, '.harness-config.json'), JSON.stringify({
    gradle: { compile: 'classes', build: 'build' },
    agents: { implementation: { command: path.join(fixtures, 'fake-agent.mjs') }, review: { command: path.join(fixtures, 'fake-agent.mjs') } },
    runtime: {
      command: path.join(fixtures, 'fake-mct.mjs'),
      server: { directory: '.harness-state/runtime/server', command: ['node', 'server.mjs'], address: '127.0.0.1:25599' },
      clients: ['harness-a'],
      world: 'harness-world',
    },
  }, null, 2));
  git('add', '-A');
  git('commit', '-q', '-m', 'Initial project');
  const server = path.join(root, '.harness-state', 'runtime', 'server');
  mkdirSync(server, { recursive: true });
  writeFileSync(path.join(server, 'eula.txt'), 'eula=true\n');
  copyFileSync(path.join(fixtures, 'fake-server.mjs'), path.join(server, 'server.mjs'));
  writeFileSync(path.join(state, 'script.json'), JSON.stringify(script));
  if (scenarioFailures) writeFileSync(path.join(state, 'scenario-failures'), String(scenarioFailures));
  process.env.FAKE_SCRIPT = path.join(state, 'script.json');
  process.env.FAKE_STATE = state;
  return {
    root,
    git,
    calls: () => readLines(path.join(state, 'calls.jsonl')).map(line => JSON.parse(line)),
    mctLog: () => readLines(path.join(state, 'mct.log')),
    harnessState: () => JSON.parse(readFileSync(path.join(root, '.harness-state', 'state.json'), 'utf8')),
  };
}

function readLines(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

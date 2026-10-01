import { access, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { assertRoot, git, gitProcess, head, verifyIdHistory } from '../git/git.js';
import { exists, json, safePath } from '../io.js';
import { run, success } from '../process.js';
import type { Runner } from '../process.js';
import { parseProject } from '../spec/parser.js';
import type { ProjectSpec } from '../spec/parser.js';
import { checkProjections, materialize } from '../spec/projector.js';
import { loadState } from '../state/state.js';
import { acFingerprint } from '../spec/diff.js';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { validateEvidence } from '../verification/evidence.js';

export async function gradleTasks(root: string, runner: Runner = run): Promise<Set<string>> {
  const output = success(await runner(path.join(root, 'gradlew'), ['tasks', '--all', '--console=plain', '--no-daemon'], { cwd: root }), 'Gradle task detection').stdout;
  return new Set(output.split(/\r?\n/).map(line => line.match(/^([\w:-]+)(?: - .*)?$/)?.[1]).filter((task): task is string => !!task));
}
export function detectTask(tasks: Set<string>, name: string, optional = false): string | null {
  const matches = [...tasks].filter(task => task.split(':').at(-1) === name);
  if (!matches.length && optional) return null;
  if (matches.length !== 1) throw new Error(`Cannot unambiguously detect Gradle ${name}; set .harness-config.json explicitly (found ${matches.join(', ') || 'none'})`);
  return matches[0]!;
}

async function basicContract(root: string): Promise<void> {
  await assertRoot(root);
  for (const file of ['gradlew', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties', '.gitmodules', '.harness/.git']) {
    if (!await exists(await safePath(root, file))) throw new Error(`Project Contract: missing ${file}`);
  }
  await access(path.join(root, 'gradlew'), constants.X_OK);
  const modules = await git(root, ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$']);
  if (modules.split('\n').filter(line => /\s\.harness$/.test(line)).length !== 1) throw new Error('Project Contract: .harness must be a registered Git submodule');
  if (!/^160000 /m.test(await git(root, ['ls-files', '--stage', '--', '.harness']))) throw new Error('Project Contract: .harness must be staged as a gitlink');
  await head(path.join(root, '.harness'));
}
async function capability(root: string, config: Config): Promise<void> {
  const buildFile = await safePath(root, config.project.buildFile);
  const build = await readFile(buildFile, 'utf8');
  if (!/net\.neoforged\.(?:moddev|gradle\.userdev)/.test(build)) throw new Error(`Project Contract: no NeoForge plugin in ${config.project.buildFile}`);
  const metadata = await readFile(await safePath(root, config.project.metadata), 'utf8');
  if (!/^\s*\[\[mods\]\]/m.test(metadata) || !/^\s*modId\s*=/m.test(metadata)) throw new Error('Project Contract: invalid NeoForge mod metadata');
  for (const task of Object.values(config.gradle)) if (task !== null && !/^[\w:][\w:-]*$/.test(task)) throw new Error(`Invalid Gradle task name: ${task}`);
}
export async function contract(root: string, config: Config): Promise<void> {
  await basicContract(root);
  await capability(root, config);
  await safePath(root, '.harness-state');
  if ((await git(root, ['ls-files', '--', '.harness-state'])).trim()) throw new Error('.harness-state must not be tracked');
  const ignored = await gitProcess(root, ['check-ignore', '--no-index', '-q', '.harness-state/probe']);
  if (![0, 1].includes(ignored.code)) success(ignored, 'Git ignore check');
  if (ignored.code !== 0) throw new Error('Project Contract: .harness-state/ must be gitignored');
}
export async function initProject(root: string, runner: Runner = run): Promise<void> {
  await basicContract(root);
  const configFile = await safePath(root, '.harness-config.json');
  let config: Config;
  if (await exists(configFile)) { config = await loadConfig(root); await capability(root, config); }
  else {
    const choose = async (files: string[], label: string): Promise<string> => {
      const found: string[] = [];
      for (const file of files) if (await exists(await safePath(root, file))) found.push(file);
      if (found.length !== 1) throw new Error(`Cannot unambiguously detect ${label}; create explicit config (found ${found.join(', ') || 'none'})`);
      return found[0]!;
    };
    const project = { buildFile: await choose(['build.gradle', 'build.gradle.kts'], 'NeoForge build file'), metadata: await choose(['src/main/resources/META-INF/neoforge.mods.toml', 'src/main/templates/META-INF/neoforge.mods.toml'], 'mod metadata') };
    const tasks = await gradleTasks(root, runner);
    config = { contract: 1, project,
      gradle: { compile: detectTask(tasks, 'classes')!, build: detectTask(tasks, 'build')!, test: detectTask(tasks, 'test')!, gameTest: detectTask(tasks, 'runGameTestServer', true) },
      agents: { implementation: { command: 'codex', model: null }, review: { command: 'claude', model: null } },
      runtime: { provider: 'mc-pilot', command: 'mct', clients: [], server: null, deploy: [], logs: [] } };
    await capability(root, config);
    await writeFile(configFile, json(config), { flag: 'wx' });
  }
  const specFile = await safePath(root, 'PROJECT.md');
  if (!await exists(specFile)) await writeFile(specFile, await readFile(new URL('../../templates/PROJECT.md', import.meta.url), 'utf8'), { flag: 'wx' });
  const spec = parseProject(await readFile(specFile, 'utf8'));
  const ignore = await safePath(root, '.gitignore');
  const content = await exists(ignore) ? await readFile(ignore, 'utf8') : '';
  const ignored = await gitProcess(root, ['check-ignore', '--no-index', '-q', '.harness-state/probe']);
  if (![0, 1].includes(ignored.code)) success(ignored, 'Git ignore check');
  if (ignored.code !== 0) await writeFile(ignore, content + (content && !content.endsWith('\n') ? '\n' : '') + '/.harness-state/\n');
  await contract(root, config);
  await checkProjections(root, spec);
  await loadState(root);
  await materialize(root, spec);
}

export async function validateProject(root: string): Promise<{ config: Config; spec: ProjectSpec }> {
  const config = await loadConfig(root);
  await contract(root, config);
  const spec = parseProject(await readFile(await safePath(root, 'PROJECT.md'), 'utf8'));
  await checkProjections(root, spec);
  await verifyIdHistory(root, spec);
  const state = await loadState(root);
  if (state) {
    if (state.specHash !== spec.hash) throw new Error('State spec hash is stale; product changes must use harness chat');
    const active = spec.acs.filter(ac => ac.active);
    const checked = new Set<string>();
    if (Object.keys(state.acs).sort().join() !== active.map(ac => ac.id).sort().join()) throw new Error('State AC set does not match PROJECT.md');
    for (const ac of active) {
      const item = state.acs[ac.id]!;
      if (item.fingerprint !== acFingerprint(spec, ac.id)) throw new Error(`State fingerprint mismatch: ${ac.id}`);
      if (item.status === 'verified') {
        if (!item.runId || !item.checkpoint) throw new Error(`Verified AC lacks checkpoint: ${ac.id}`);
        const cp = state.checkpoints.find(cp => cp.commit === item.checkpoint && cp.acIds.includes(ac.id) && cp.runId === item.runId);
        if (!cp) throw new Error(`Verified AC has no recorded checkpoint: ${ac.id}`);
        const msg = await git(root, ['log', '-1', '--format=%B', cp.commit]);
        for (const trailer of [`Harness-Milestone: ${cp.milestone}`, `Harness-Spec-Hash: ${cp.specHash}`, `Harness-Verification-Run: ${cp.runId}`]) if (!msg.split('\n').includes(trailer)) throw new Error(`Checkpoint trailer mismatch: ${ac.id}`);
        if (!msg.split('\n').includes(`Harness-AC: ${cp.acIds.join(', ')}`)) throw new Error(`Checkpoint AC trailer mismatch: ${ac.id}`);
        await git(root, ['merge-base', '--is-ancestor', cp.commit, 'HEAD']);
        if (!checked.has(cp.runId)) {
          const stillVerified = cp.acIds.filter(id => state.acs[id]?.status === 'verified' && state.acs[id]?.runId === cp.runId && state.acs[id]?.checkpoint === cp.commit);
          await validateEvidence(root, spec, cp, stillVerified); checked.add(cp.runId);
        }
      }
    }
    if (state.phase === 'complete' && (!state.regression || state.regression.specHash !== spec.hash || state.regression.revision !== state.revision || active.some(ac => state.acs[ac.id]!.status !== 'verified'))) throw new Error('Invalid complete state: current regression and all verified ACs are required');
    if (state.phase === 'complete' && state.regression) await validateEvidence(root, spec, { ...state.regression, milestone: 'regression', acIds: active.map(ac => ac.id) });
  }
  return { config, spec };
}

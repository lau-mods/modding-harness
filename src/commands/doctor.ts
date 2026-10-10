import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkRuntimeConfig, loadConfig } from '../config/config.js';
import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';
import { mcPilot, pilotEnv } from '../e2e/runtime.js';

// 診断 1 項目の結果。detail は問題がある場合の理由 (§9.3)
export type Diagnostic = { name: string; status: 'ok' | 'missing' | 'misconfigured'; detail: string };

const PROBE_TIMEOUT_MS = 5 * 60 * 1000;

// Node.js・Git・Java・Gradle Wrapper・Codex・Claude・MC Pilot・Minecraft runtime の構成を診断する (§9.3)
export async function doctor(root: string, runner: Runner): Promise<Diagnostic[]> {
  const major = Number(process.versions.node.split('.')[0]);
  const results: Diagnostic[] = [{ name: 'Node.js', status: major >= 20 ? 'ok' : 'misconfigured', detail: major >= 20 ? process.version : `${process.version}; Node.js 20 or later is required` }];
  results.push(await probe(root, 'Git', 'git', ['--version'], runner));
  results.push(await probe(root, 'Java', 'java', ['-version'], runner));
  results.push(await probe(root, 'Gradle Wrapper', path.join(root, 'gradlew'), ['--version'], runner));
  let config: HarnessConfig;
  try {
    config = await loadConfig(root);
    results.push({ name: 'Config', status: 'ok', detail: '.harness-config.json' });
  } catch (error) {
    results.push({ name: 'Config', status: 'misconfigured', detail: (error as Error).message });
    return results;
  }
  results.push(...await checkAgents(root, config, runner));
  results.push(...await checkRuntime(root, config, runner));
  return results;
}

// Codex / Claude CLI が実行でき、認証が利用可能か確認する (§9.3)
export async function checkAgents(root: string, config: HarnessConfig, runner: Runner): Promise<Diagnostic[]> {
  const codex = await probe(root, 'Codex', config.agents.implementation.command, ['login', 'status'], runner);
  const claude = await probe(root, 'Claude', config.agents.review.command, ['auth', 'status'], runner);
  // claude auth status は終了コード 0 のまま未ログインを JSON で返す
  const status = claude.status === 'ok' ? parseJson(claude.detail) as { loggedIn?: boolean; authMethod?: string } | null : null;
  if (status) {
    claude.status = status.loggedIn ? 'ok' : 'misconfigured';
    claude.detail = status.loggedIn ? `logged in (${status.authMethod})` : 'Not logged in; run claude auth login';
  }
  return [codex, claude];
}

// MC Pilot・NeoForge server・client instance の準備状況を確認する (§9.3)
export async function checkRuntime(root: string, config: HarnessConfig, runner: Runner): Promise<Diagnostic[]> {
  const results = [await probe(root, 'MC Pilot', config.runtime.command, ['--cli-version'], runner, pilotEnv(root))];
  const problems = checkRuntimeConfig(config.runtime);
  if (problems.length) return [...results, { name: 'Runtime', status: 'misconfigured', detail: problems.join('; ') }];
  const server = config.runtime.server!;
  const eula = await readFile(path.join(root, server.directory, 'eula.txt'), 'utf8').catch(() => '');
  results.push(/^eula=true\s*$/m.test(eula)
    ? { name: 'Server', status: 'ok', detail: server.directory }
    : { name: 'Server', status: 'missing', detail: `Install the NeoForge server in ${server.directory} and accept the Minecraft EULA in eula.txt` });
  try {
    const listed = await mcPilot(root, config.runtime, ['client', 'list'], runner) as { clients?: { name: string }[] } | null;
    const missing = config.runtime.clients.filter(name => !listed?.clients?.some(client => client.name === name));
    results.push(missing.length
      ? { name: 'Clients', status: 'missing', detail: `Create with MCT_HOME=${pilotEnv(root).MCT_HOME}: ${missing.join(', ')}` }
      : { name: 'Clients', status: 'ok', detail: config.runtime.clients.join(', ') });
  } catch (error) {
    results.push({ name: 'Clients', status: 'misconfigured', detail: (error as Error).message });
  }
  return results;
}

// コマンドを実行し、終了コード 0 なら ok として出力の要約を返す
export async function probe(root: string, name: string, command: string, args: string[], runner: Runner, env: NodeJS.ProcessEnv = {}): Promise<Diagnostic> {
  try {
    const result = await runner(command, args, { cwd: root, env, timeoutMs: PROBE_TIMEOUT_MS });
    const detail = (result.stdout || result.stderr).trim() || `exit ${result.code}`;
    return { name, status: result.code === 0 ? 'ok' : 'misconfigured', detail };
  } catch (error) {
    return { name, status: 'missing', detail: (error as Error).message };
  }
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

import { FatalError } from '../core/errors.js';
import { readJson } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';

// Workspace ごとの Harness 設定ファイル名 (§8)
export const CONFIG_FILE = '.harness-config.json';

// 各工程で実行する Gradle task (§8)
export type GradleConfig = { compile: string; build: string; gameTest: string };

// Codex / Claude CLI の呼び出し設定。model が null なら CLI の標準モデルを使う (§8)
export type AgentConfig = { command: string; model: string | null };

// Harness が起動する NeoForge dedicated server。directory は Workspace root からの相対パス、address は host:port (§16.2)
export type ServerConfig = { directory: string; command: string[]; address: string; world: string };

// Minecraft runtime の設定。client は MC Pilot の instance 名、deploy は server / client 以外の Mod jar の追加配置先、logs は追加で収集する log (§8, §16.2)
export type RuntimeConfig = {
  command: string; // MC Pilot CLI
  server: ServerConfig | null;
  clients: string[];
  deploy: string[];
  logs: string[];
};

// .harness-config.json の内容 (§8)
export type HarnessConfig = {
  gradle: GradleConfig;
  agents: { implementation: AgentConfig; review: AgentConfig };
  runtime: RuntimeConfig;
};

// .harness-config.json を読み込み検証する。読めない・必須設定が無い場合は FatalError (§23)
export async function loadConfig(root: string): Promise<HarnessConfig> {
  let value: unknown;
  try { value = await readJson(projectPaths(root).config); }
  catch (error) { throw new FatalError(`Cannot read ${CONFIG_FILE}: ${(error as Error).message}`); }
  const problems = checkConfig(value);
  if (problems.length) throw new FatalError(`Invalid ${CONFIG_FILE}:\n- ${problems.join('\n- ')}`);
  return value as HarnessConfig;
}

// 任意の値を HarnessConfig として検証し、問題点を列挙する (§9.4)
export function checkConfig(value: unknown): string[] {
  const problems: string[] = [];
  const get = (key: string): unknown => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | null | undefined)?.[part], value);
  const text = (key: string): void => {
    const field = get(key);
    if (typeof field !== 'string' || !field) problems.push(`${key} must be a non-empty string`);
  };
  const texts = (key: string): void => {
    const field = get(key);
    if (!Array.isArray(field) || !field.every(item => typeof item === 'string' && item)) problems.push(`${key} must be an array of non-empty strings`);
  };
  for (const key of ['gradle.compile', 'gradle.build', 'gradle.gameTest', 'agents.implementation.command', 'agents.review.command', 'runtime.command']) text(key);
  for (const key of ['agents.implementation.model', 'agents.review.model']) {
    const field = get(key);
    if (field !== null && (typeof field !== 'string' || !field)) problems.push(`${key} must be null or a non-empty string`);
  }
  for (const key of ['runtime.clients', 'runtime.deploy', 'runtime.logs']) texts(key);
  if (get('runtime.server') !== null) {
    for (const key of ['runtime.server.directory', 'runtime.server.address', 'runtime.server.world']) text(key);
    texts('runtime.server.command');
    if (!(get('runtime.server.command') as unknown[] | undefined)?.length) problems.push('runtime.server.command must not be empty');
    if (!/:\d+$/.test(String(get('runtime.server.address')))) problems.push('runtime.server.address must be host:port');
  }
  return problems;
}

// E2E の実行に必要な runtime 設定 (server・client) が揃っているかを検証し、問題点を列挙する (§10.1, §23)
export function checkRuntimeConfig(config: RuntimeConfig): string[] {
  const problems: string[] = [];
  if (!config.server) problems.push('runtime.server must configure the NeoForge dedicated server');
  if (!config.clients.length) problems.push('runtime.clients must list at least one MC Pilot client');
  return problems;
}

// init / create 時に書き出す既定の設定を返す。runtime の server と client は利用者が構成する (§8)
export function defaultConfig(): HarnessConfig {
  return {
    gradle: { compile: 'classes', build: 'build', gameTest: 'runGameTestServer' },
    agents: { implementation: { command: 'codex', model: null }, review: { command: 'claude', model: null } },
    runtime: { command: 'mct', server: null, clients: [], deploy: [], logs: [] },
  };
}

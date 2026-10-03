import { FatalError } from '../core/errors.js';
import { readJson } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';

// project ごとの Harness 設定ファイル名 (§26)
export const CONFIG_FILE = '.harness-config.json';

// Codex / Claude CLI の呼び出し設定
export type AgentConfig = { command: string; model?: string };

// Harness が起動する NeoForge server。directory は project root からの相対パス
export type ServerConfig = { directory: string; command: string[]; address: string };

// Minecraft 実機環境の接続設定。client は MC Pilot、server は Harness が管理する (§26, §27)
export type RuntimeConfig = {
  command: string; // MC Pilot CLI
  server: ServerConfig;
  clients: string[]; // MC Pilot の client instance 名
  world: string; // 固定テスト world 名 (§28)
};

// .harness-config.json の内容 (§26)
export type HarnessConfig = {
  project: { buildFile: string };
  gradle: { compile: string; build: string };
  agents: { implementation: AgentConfig; review: AgentConfig };
  runtime: RuntimeConfig;
};

// .harness-config.json を読み込み検証する。読めない・必須設定が無い場合は FatalError (§20)
export async function loadConfig(root: string): Promise<HarnessConfig> {
  let value: unknown;
  try { value = await readJson(projectPaths(root).config); }
  catch (error) { throw new FatalError(`Cannot read ${CONFIG_FILE}: ${(error as Error).message}`); }
  const problems = checkConfig(value);
  if (problems.length) throw new FatalError(`Invalid ${CONFIG_FILE}: ${problems.join('; ')}`);
  return value as HarnessConfig;
}

// 任意の値を HarnessConfig として検証し、問題点を列挙する
export function checkConfig(value: unknown): string[] {
  const problems: string[] = [];
  const get = (key: string): unknown => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], value);
  for (const key of ['project.buildFile', 'gradle.compile', 'gradle.build', 'agents.implementation.command', 'agents.review.command', 'runtime.command', 'runtime.world', 'runtime.server.directory', 'runtime.server.address']) {
    const field = get(key);
    if (typeof field !== 'string' || !field) problems.push(`${key} must be a non-empty string`);
  }
  for (const key of ['agents.implementation.model', 'agents.review.model']) {
    if (get(key) !== undefined && typeof get(key) !== 'string') problems.push(`${key} must be a string`);
  }
  for (const key of ['runtime.server.command', 'runtime.clients']) {
    const field = get(key);
    if (!Array.isArray(field) || !field.length || !field.every(item => typeof item === 'string' && item)) problems.push(`${key} must be a non-empty string array`);
  }
  return problems;
}

// init 時に書き出す既定の設定を返す
export function defaultConfig(): HarnessConfig {
  return {
    project: { buildFile: 'build.gradle' },
    gradle: { compile: 'classes', build: 'build' },
    agents: { implementation: { command: 'codex' }, review: { command: 'claude' } },
    runtime: {
      command: 'mct',
      server: { directory: '.harness-state/runtime/server', command: ['./run.sh', '--nogui'], address: '127.0.0.1:25565' },
      clients: ['harness-a', 'harness-b'],
      world: 'harness-world',
    },
  };
}

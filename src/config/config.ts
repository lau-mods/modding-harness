import { homedir } from 'node:os';
import path from 'node:path';
import { FatalError } from '../core/errors.js';
import { readJson } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';

// Workspace ごとの Harness 設定ファイル名 (§8)
export const CONFIG_FILE = '.harness-config.json';

// 各工程で実行する Gradle task (§8)
export type GradleConfig = { compile: string; build: string; gameTest: string };

// 役割に使う agent CLI の種類 (§8)
export type AgentType = 'codex' | 'claude' | 'opencode';

// 有効な agent CLI の種類
export const AGENT_TYPES: AgentType[] = ['codex', 'claude', 'opencode'];

// agent CLI の呼び出し設定。model / effort が null なら CLI の設定に従う。fast / provider は type が codex の場合だけ使う (§8)
// fast が true なら Codex を Fast (priority) tier で実行し、false または省略なら CLI の設定に従う。provider が null または省略なら CLI の設定の provider を使う
export type AgentConfig = { type: AgentType; command: string; model: string | null; effort: string | null; fast?: boolean; provider?: ProviderConfig | null };

// agent が使う model と effort の組
export type ModelConfig = Pick<AgentConfig, 'model' | 'effort'>;

// milestone 内で繰り返し実行する agent の設定。initial を初回、retry を 2 回目以降に使う (§8)
export type RepeatedAgent<C extends AgentConfig> = Omit<C, keyof ModelConfig> & { initial: ModelConfig; retry: ModelConfig };

// Codex が使う Responses API 互換の model provider。id は Codex 上の provider 名、envKey は API キーを読む環境変数
export type ProviderConfig = { id: string; baseUrl: string; envKey: string };

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
  parallel: number; // 同時に進める milestone の上限 (§10.3)
  gradle: GradleConfig;
  agents: {
    plan: AgentConfig; // plan / chat
    implementation: RepeatedAgent<AgentConfig>; // 実装・修正
    codeReview: RepeatedAgent<AgentConfig>; // Code Review
    e2eReview: RepeatedAgent<AgentConfig>; // E2E の screenshot レビュー
  };
  runtime: RuntimeConfig;
};

// .harness-config.json を読み込み検証し、~/ で始まる値を home ディレクトリのパスに展開する。読めない・必須設定が無い場合は FatalError (§23)
export async function loadConfig(root: string): Promise<HarnessConfig> {
  let value: unknown;
  try { value = await readJson(projectPaths(root).config); }
  catch (error) { throw new FatalError(`Cannot read ${CONFIG_FILE}: ${(error as Error).message}`); }
  const problems = checkConfig(value);
  if (problems.length) throw new FatalError(`Invalid ${CONFIG_FILE}:\n- ${problems.join('\n- ')}`);
  const config = JSON.parse(JSON.stringify(value), (_, item: unknown) => typeof item === 'string' && item.startsWith('~/') ? path.join(homedir(), item.slice(2)) : item) as HarnessConfig;
  // parallel の追加前に書き出した設定ファイルには無いため、既定値で補う
  return { ...config, parallel: config.parallel ?? defaultConfig().parallel };
}

// 任意の値を HarnessConfig として検証し、問題点を列挙する (§9.4)
export function checkConfig(value: unknown): string[] {
  const problems: string[] = [];
  // 設定ファイルは commit されるため、利用者名を含む home ディレクトリの絶対パスは ~/ で書かせる
  if (JSON.stringify(value).includes(homedir())) problems.push(`Write paths under the home directory as ~/ instead of ${homedir()}`);
  const get = (key: string): unknown => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | null | undefined)?.[part], value);
  const text = (key: string): void => {
    const field = get(key);
    if (typeof field !== 'string' || !field) problems.push(`${key} must be a non-empty string`);
  };
  const texts = (key: string): void => {
    const field = get(key);
    if (!Array.isArray(field) || !field.every(item => typeof item === 'string' && item)) problems.push(`${key} must be an array of non-empty strings`);
  };
  const parallel = get('parallel');
  if (parallel !== undefined && !(Number.isInteger(parallel) && (parallel as number) >= 1)) problems.push('parallel must be an integer of 1 or more');
  const repeatedAgents = ['implementation', 'codeReview', 'e2eReview'].map(name => `agents.${name}`);
  const agents = ['agents.plan', ...repeatedAgents];
  for (const key of ['gradle.compile', 'gradle.build', 'gradle.gameTest', ...agents.map(agent => `${agent}.command`), 'runtime.command']) text(key);
  for (const agent of agents) {
    if (!AGENT_TYPES.includes(get(`${agent}.type`) as AgentType)) problems.push(`${agent}.type must be one of ${AGENT_TYPES.join(', ')}`);
    const fast = get(`${agent}.fast`);
    if (fast !== undefined && typeof fast !== 'boolean') problems.push(`${agent}.fast must be true or false`);
    const provider = get(`${agent}.provider`);
    if (provider !== undefined && provider !== null) {
      for (const key of ['id', 'baseUrl', 'envKey']) text(`${agent}.provider.${key}`);
    }
  }
  const models = ['agents.plan', ...repeatedAgents.flatMap(agent => [`${agent}.initial`, `${agent}.retry`])];
  for (const key of models.flatMap(model => [`${model}.model`, `${model}.effort`])) {
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
    parallel: 3,
    gradle: { compile: 'classes', build: 'build', gameTest: 'runGameTestServer' },
    agents: {
      plan: { type: 'claude', command: 'claude', model: 'claude-opus-5-5', effort: 'high' },
      implementation: { type: 'codex', command: 'codex', initial: { model: 'gpt-6-sol', effort: 'high' }, retry: { model: 'gpt-6-sol', effort: 'medium' }, fast: true, provider: null },
      codeReview: { type: 'claude', command: 'claude', initial: { model: 'claude-opus-5-5', effort: 'medium' }, retry: { model: 'claude-sonnet-5-5', effort: 'medium' } },
      e2eReview: { type: 'claude', command: 'claude', initial: { model: 'claude-opus-5-5', effort: 'high' }, retry: { model: 'claude-sonnet-5-5', effort: 'high' } },
    },
    runtime: { command: 'mct', server: null, clients: [], deploy: [], logs: [] },
  };
}

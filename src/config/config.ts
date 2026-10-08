// Workspace ごとの Harness 設定ファイル名 (§8)
export const CONFIG_FILE = '.harness-config.json';

// 各工程で実行する Gradle task (§8)
export type GradleConfig = { compile: string; build: string; gameTest: string };

// Codex / Claude CLI の呼び出し設定。model が null なら CLI の標準モデルを使う (§8)
export type AgentConfig = { command: string; model: string | null };

// Harness が起動する NeoForge dedicated server。directory は Workspace root からの相対パス (§16.2)
export type ServerConfig = { directory: string; command: string[]; address: string; world: string };

// Minecraft runtime の設定。client は MC Pilot の instance 名、deploy は Mod jar の配置先、logs は収集する log (§8, §16.2)
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
  throw new Error('Not implemented');
}

// 任意の値を HarnessConfig として検証し、問題点を列挙する (§9.4)
export function checkConfig(value: unknown): string[] {
  throw new Error('Not implemented');
}

// E2E の実行に必要な runtime 設定 (server・client) が揃っているかを検証し、問題点を列挙する (§10.1, §23)
export function checkRuntimeConfig(config: RuntimeConfig): string[] {
  throw new Error('Not implemented');
}

// init / create 時に書き出す既定の設定を返す (§8)
export function defaultConfig(): HarnessConfig {
  throw new Error('Not implemented');
}

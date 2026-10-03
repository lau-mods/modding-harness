// project ごとの Harness 設定ファイル名 (§26)
export const CONFIG_FILE = '.harness-config.json';

// Codex / Claude CLI の呼び出し設定
export type AgentConfig = { command: string; model?: string };

// Minecraft 実機環境 (MC Pilot) の接続設定 (§26, §27)
export type RuntimeConfig = {
  command: string; // MC Pilot CLI
  server: string; // server instance 名
  clients: string[]; // 利用可能な client instance 名
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
  throw new Error('Not implemented');
}

// 任意の値を HarnessConfig として検証し、問題点を列挙する
export function checkConfig(value: unknown): string[] {
  throw new Error('Not implemented');
}

// init 時に書き出す既定の設定を返す
export function defaultConfig(): HarnessConfig {
  throw new Error('Not implemented');
}

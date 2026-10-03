import type { RuntimeConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';

// Harness が起動した Minecraft 実機環境 1 回分 (§12, §27)
export type RuntimeSession = { server: string; clients: string[]; world: string; logDir: string; startedAt: string };

// MC Pilot CLI を呼び出して JSON 出力を返す。接続失敗は ExecutionFailure (§17)
export async function mcPilot(config: RuntimeConfig, args: string[], logDir: string, runner: Runner): Promise<unknown> {
  throw new Error('Not implemented');
}

// build した mod jar を server / client の mod 配置先へ配置する (§27)
export async function deployMod(config: RuntimeConfig, modJar: string, logDir: string, runner: Runner): Promise<void> {
  throw new Error('Not implemented');
}

// 固定テスト world で server を起動し client を接続させる。起動失敗・crash は ExecutionFailure (§17, §28)
export async function startRuntime(config: RuntimeConfig, logDir: string, runner: Runner): Promise<RuntimeSession> {
  throw new Error('Not implemented');
}

// server / client を停止する
export async function stopRuntime(config: RuntimeConfig, session: RuntimeSession, runner: Runner): Promise<void> {
  throw new Error('Not implemented');
}

// server / client の log を session の logDir へ保存し、保存先パスを返す (§29)
export async function collectLogs(config: RuntimeConfig, session: RuntimeSession, runner: Runner): Promise<string[]> {
  throw new Error('Not implemented');
}

// scenario process に渡す環境変数 (MC Pilot command・instance 名・world・結果出力先など) を組み立てる
export function scenarioEnv(config: RuntimeConfig, session: RuntimeSession, resultFile: string, screenshotDir: string): NodeJS.ProcessEnv {
  throw new Error('Not implemented');
}

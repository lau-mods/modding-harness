import type { RuntimeConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';

// Harness が起動した Minecraft runtime 1 回分 (§16.2)
export type RuntimeSession = { server: string; clients: string[]; world: string; logDir: string; startedAt: string };

// MC Pilot に渡す環境変数。MC Pilot の home と cache は .harness-state/runtime に置く
export function pilotEnv(root: string): NodeJS.ProcessEnv {
  throw new Error('Not implemented');
}

// MC Pilot CLI を呼び出して JSON envelope の data を返す。失敗は ExecutionFailure (§19.1)
export async function mcPilot(root: string, config: RuntimeConfig, args: string[], runner: Runner): Promise<unknown> {
  throw new Error('Not implemented');
}

// Mod jar を設定された配置先へ配置し、前回配置した jar を置き換える (§16.2 Mod Deploy)
export async function deployMod(root: string, config: RuntimeConfig, modJar: string): Promise<void> {
  throw new Error('Not implemented');
}

// 検証用 world を準備して NeoForge server を起動し、起動完了まで待つ。crash・Mod load failure は ExecutionFailure (§16.2, §19.1)
export async function startServer(root: string, config: RuntimeConfig, logDir: string): Promise<void> {
  throw new Error('Not implemented');
}

// server を停止し、world の保存と終了を待つ。時間内に終わらなければ強制終了する (§16.2 Server Stop)
export async function stopServer(root: string): Promise<void> {
  throw new Error('Not implemented');
}

// 設定された全 client を MC Pilot で起動し、server の world に参加するまで待つ (§16.2 Client Start, World Load)
export async function startClients(root: string, config: RuntimeConfig, runner: Runner): Promise<void> {
  throw new Error('Not implemented');
}

// 設定された全 client を MC Pilot で停止する。停止済みの client はそのままにする (§16.2 Client Stop)
export async function stopClients(root: string, config: RuntimeConfig, runner: Runner): Promise<void> {
  throw new Error('Not implemented');
}

// server と全 client を起動して RuntimeSession を返す (§16.2)
export async function startRuntime(root: string, config: RuntimeConfig, logDir: string, runner: Runner): Promise<RuntimeSession> {
  throw new Error('Not implemented');
}

// client と server を停止する。前回の残存 process の停止にも使う (§16.2, §20.3)
export async function stopRuntime(root: string, config: RuntimeConfig, runner: Runner): Promise<void> {
  throw new Error('Not implemented');
}

// 設定された server / client の log を session の logDir へ集め、保存先パスを返す (§16.4)
export async function collectLogs(root: string, config: RuntimeConfig, session: RuntimeSession): Promise<string[]> {
  throw new Error('Not implemented');
}

// 一時的な runtime 状態 (検証用 world・配置済み jar・process 記録) を破棄する (§20.3)
export async function resetRuntime(root: string, config: RuntimeConfig): Promise<void> {
  throw new Error('Not implemented');
}

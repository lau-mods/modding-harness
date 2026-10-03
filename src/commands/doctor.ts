import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';

// 診断 1 項目の結果
export type Diagnostic = { name: string; status: 'ok' | 'missing' | 'misconfigured'; detail: string };

// node / git / java / gradlew / codex / claude / MC Pilot と実機環境を確認する (§25, §27)
export async function doctor(root: string, runner?: Runner): Promise<Diagnostic[]> {
  throw new Error('Not implemented');
}

// codex / claude の認証が利用可能か確認する (§20)
export async function checkAgentAuth(config: HarnessConfig, runner: Runner): Promise<Diagnostic[]> {
  throw new Error('Not implemented');
}

// MC Pilot の server / client instance と固定テスト world が用意されているか確認する (§27, §28)
export async function checkRuntime(config: HarnessConfig, runner: Runner): Promise<Diagnostic[]> {
  throw new Error('Not implemented');
}

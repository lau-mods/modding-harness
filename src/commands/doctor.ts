import type { HarnessConfig } from '../config/config.js';
import type { Runner } from '../core/process.js';

// 診断 1 項目の結果。detail は問題がある場合の理由 (§9.3)
export type Diagnostic = { name: string; status: 'ok' | 'missing' | 'misconfigured'; detail: string };

// Node.js・Git・Java・Gradle Wrapper・Codex・Claude・MC Pilot・Minecraft runtime の構成を診断する (§9.3)
export async function doctor(root: string, runner: Runner): Promise<Diagnostic[]> {
  throw new Error('Not implemented');
}

// Codex / Claude CLI が実行でき、認証が利用可能か確認する (§9.3)
export async function checkAgents(root: string, config: HarnessConfig, runner: Runner): Promise<Diagnostic[]> {
  throw new Error('Not implemented');
}

// MC Pilot・NeoForge server・client instance の準備状況を確認する (§9.3)
export async function checkRuntime(root: string, config: HarnessConfig, runner: Runner): Promise<Diagnostic[]> {
  throw new Error('Not implemented');
}

// コマンドを実行し、終了コード 0 なら ok として出力の要約を返す
export async function probe(root: string, name: string, command: string, args: string[], runner: Runner): Promise<Diagnostic> {
  throw new Error('Not implemented');
}

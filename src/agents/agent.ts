import type { AgentConfig } from '../config/config.js';
import type { FatalError } from '../core/errors.js';
import type { ProcessResult, Runner } from '../core/process.js';

// agent の役割。Codex: implementation、Claude: plan / spec_edit / code_review / code_recheck / e2e_review / e2e_recheck
export type AgentRole = 'implementation' | 'plan' | 'spec_edit' | 'code_review' | 'code_recheck' | 'e2e_review' | 'e2e_recheck';

// JSON Schema オブジェクト
export type JsonSchema = Record<string, unknown>;

// agent 呼び出しに共通する実行環境。cwd は Workspace root、記録は logDir に保存する
export type AgentCall = { config: AgentConfig; root: string; logDir: string; runner: Runner };

// agent 呼び出し 1 回分の要求。images は agent に添付する画像
export type AgentRequest = { role: AgentRole; prompt: string; images: string[] };

// agent 1 回の実行時間の上限
export const AGENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// 役割ごとの structured output schema を返す
export function outputSchema(role: AgentRole): JsonSchema {
  throw new Error('Not implemented');
}

// agent 出力を役割の schema で検証して型付きで返す。不正な出力は FatalError (§23)
export function validateOutput<T>(role: AgentRole, value: unknown): T {
  throw new Error('Not implemented');
}

// agent CLI の失敗を、終了コードと出力の要約を含む FatalError にする。agent の利用可否は doctor で確認済みのため再試行しない (§23)
export function agentFailure(role: AgentRole, result: ProcessResult): FatalError {
  throw new Error('Not implemented');
}

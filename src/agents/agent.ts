import type { AgentConfig } from '../config/config.js';
import type { ExecutionFailure, FatalError } from '../core/errors.js';
import type { ProcessResult, Runner } from '../core/process.js';

// agent の役割。Codex: implementation、Claude: plan / spec_edit / code_review / code_recheck / visual_review / visual_recheck
export type AgentRole = 'implementation' | 'plan' | 'spec_edit' | 'code_review' | 'code_recheck' | 'visual_review' | 'visual_recheck';

// JSON Schema オブジェクト
export type JsonSchema = Record<string, unknown>;

// agent 呼び出しに共通する実行環境。cwd は project root、記録は logDir に保存する
export type AgentCall = { config: AgentConfig; root: string; logDir: string; runner: Runner };

// agent 呼び出し 1 回分の要求。sessionId 指定時は既存 session を継続する
export type AgentRequest = { role: AgentRole; prompt: string; images: string[]; sessionId: string | null };

// agent の構造化出力と、継続呼び出し用の session ID
export type AgentResult<T> = { output: T; sessionId: string | null };

// 役割ごとの structured output schema を返す
export function outputSchema(role: AgentRole): JsonSchema {
  throw new Error('Not implemented');
}

// agent 出力を役割の schema で検証して型付きで返す。不正な出力は ExecutionFailure (§17)
export function validateOutput<T>(role: AgentRole, value: unknown): T {
  throw new Error('Not implemented');
}

// CLI の失敗出力から認証不可を FatalError (§20)、それ以外を ExecutionFailure (§17) に分類する
export function classifyAgentFailure(role: AgentRole, result: ProcessResult): FatalError | ExecutionFailure {
  throw new Error('Not implemented');
}
